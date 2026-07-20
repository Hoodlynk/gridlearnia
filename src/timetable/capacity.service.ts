import { BadRequestException, Injectable } from '@nestjs/common';
import { RoomType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type Severity = 'ERROR' | 'WARNING';

export interface Issue {
  severity: Severity;
  scope: 'SCHEDULE' | 'CLASS' | 'STAFF' | 'ROOM';
  message: string;
}

/**
 * Pre-flight feasibility for timetable generation.
 *
 * Solving is NP-hard, so the worst experience is a solver that grinds and then
 * fails. Everything here is cheap arithmetic that proves a solution *cannot*
 * exist (demand exceeding capacity) and says exactly what to fix — run before
 * ever starting the search.
 */
@Injectable()
export class CapacityService {
  constructor(private readonly prisma: PrismaService) {}

  async readiness(tenantId: string, academicYearId: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id: academicYearId, tenantId },
      select: { id: true, name: true },
    });
    if (!year) {
      throw new BadRequestException('Academic year not found for this school');
    }

    const issues: Issue[] = [];

    const [settings, periods] = await Promise.all([
      this.prisma.timetableSettings.findUnique({ where: { tenantId } }),
      this.prisma.period.findMany({
        where: { tenantId },
        orderBy: { order: 'asc' },
      }),
    ]);

    const teachingDays = settings?.teachingDays ?? [1, 2, 3, 4, 5];
    const teachablePeriods = periods.filter((p) => !p.isBreak);
    const slotsPerWeek = teachingDays.length * teachablePeriods.length;

    if (teachablePeriods.length === 0) {
      issues.push({
        severity: 'ERROR',
        scope: 'SCHEDULE',
        message:
          'No teachable periods defined — set up the bell schedule first.',
      });
    }
    if (teachingDays.length === 0) {
      issues.push({
        severity: 'ERROR',
        scope: 'SCHEDULE',
        message: 'No teaching days selected.',
      });
    }

    // Every requirement for this year, with what it needs.
    const assignments = await this.prisma.teachingAssignment.findMany({
      where: { tenantId, academicYearId },
      select: {
        periodsPerWeek: true,
        doublePeriods: true,
        requiredRoomType: true,
        classId: true,
        staffId: true,
        class: {
          select: {
            id: true,
            name: true,
            grade: { select: { name: true } },
          },
        },
        staff: {
          select: { id: true, firstName: true, lastName: true, maxPeriodsPerDay: true },
        },
      },
    });

    const untimetabled = assignments.filter((a) => a.periodsPerWeek === 0).length;
    if (untimetabled > 0) {
      issues.push({
        severity: 'WARNING',
        scope: 'CLASS',
        message: `${untimetabled} teaching assignment(s) have no periods per week set — they will not be scheduled.`,
      });
    }

    // ── Per class ───────────────────────────────────────────────────────────
    const classMap = new Map<
      string,
      { id: string; label: string; demand: number }
    >();
    for (const a of assignments) {
      const label = `${a.class.grade.name} ${a.class.name}`;
      const row = classMap.get(a.classId) ?? {
        id: a.classId,
        label,
        demand: 0,
      };
      row.demand += a.periodsPerWeek;
      classMap.set(a.classId, row);
    }
    // A per-day ceiling can bite before the weekly one does.
    const classDailyCap = settings?.maxLessonsPerClassPerDay ?? null;
    const classWeeklyCapacity =
      classDailyCap != null
        ? Math.min(slotsPerWeek, classDailyCap * teachingDays.length)
        : slotsPerWeek;

    const classes = [...classMap.values()].map((c) => {
      const over = c.demand > classWeeklyCapacity;
      if (over) {
        issues.push({
          severity: 'ERROR',
          scope: 'CLASS',
          message:
            classDailyCap != null && classWeeklyCapacity < slotsPerWeek
              ? `${c.label} needs ${c.demand} periods but is capped at ${classDailyCap}/day (${classWeeklyCapacity}/week).`
              : `${c.label} needs ${c.demand} periods but the week only has ${slotsPerWeek}.`,
        });
      }
      return {
        ...c,
        capacity: classWeeklyCapacity,
        free: classWeeklyCapacity - c.demand,
        over,
      };
    });
    classes.sort((a, b) => a.label.localeCompare(b.label));

    // ── Per staff ───────────────────────────────────────────────────────────
    const unavailability = await this.prisma.staffUnavailability.findMany({
      where: { tenantId },
      select: { staffId: true, day: true, period: { select: { isBreak: true } } },
    });
    const blockedByStaff = new Map<string, number>();
    for (const u of unavailability) {
      // Only count blocks that land on a real teaching slot.
      if (u.period.isBreak || !teachingDays.includes(u.day)) continue;
      blockedByStaff.set(u.staffId, (blockedByStaff.get(u.staffId) ?? 0) + 1);
    }

    const staffMap = new Map<
      string,
      { id: string; label: string; demand: number; maxPerDay: number | null }
    >();
    for (const a of assignments) {
      const row = staffMap.get(a.staffId) ?? {
        id: a.staffId,
        label: `${a.staff.firstName} ${a.staff.lastName}`,
        demand: 0,
        maxPerDay: a.staff.maxPeriodsPerDay,
      };
      row.demand += a.periodsPerWeek;
      staffMap.set(a.staffId, row);
    }

    const defaultMaxPerDay = settings?.maxPeriodsPerTeacherPerDay ?? null;
    const staff = [...staffMap.values()].map((s) => {
      const blocked = blockedByStaff.get(s.id) ?? 0;
      const available = slotsPerWeek - blocked;
      const over = s.demand > available;
      if (over) {
        issues.push({
          severity: 'ERROR',
          scope: 'STAFF',
          message: `${s.label} is assigned ${s.demand} periods but is only available for ${available}.`,
        });
      }
      // Daily ceiling: even if the week fits, a per-day cap can make it impossible.
      const cap = s.maxPerDay ?? defaultMaxPerDay;
      if (cap != null && s.demand > cap * teachingDays.length) {
        issues.push({
          severity: 'ERROR',
          scope: 'STAFF',
          message: `${s.label} is capped at ${cap} periods/day (${cap * teachingDays.length}/week) but is assigned ${s.demand}.`,
        });
      }
      return {
        ...s,
        blocked,
        available,
        free: available - s.demand,
        over,
      };
    });
    staff.sort((a, b) => a.label.localeCompare(b.label));

    // ── Per room type ───────────────────────────────────────────────────────
    const rooms = await this.prisma.room.findMany({
      where: { tenantId, deletedAt: null },
      select: { type: true },
    });
    const roomCountByType = new Map<RoomType, number>();
    for (const r of rooms) {
      roomCountByType.set(r.type, (roomCountByType.get(r.type) ?? 0) + 1);
    }
    const demandByRoomType = new Map<RoomType, number>();
    for (const a of assignments) {
      if (!a.requiredRoomType) continue;
      demandByRoomType.set(
        a.requiredRoomType,
        (demandByRoomType.get(a.requiredRoomType) ?? 0) + a.periodsPerWeek,
      );
    }
    const roomTypes = [...demandByRoomType.entries()].map(([type, demand]) => {
      const count = roomCountByType.get(type) ?? 0;
      const capacity = count * slotsPerWeek;
      const over = demand > capacity;
      if (count === 0) {
        issues.push({
          severity: 'ERROR',
          scope: 'ROOM',
          message: `Lessons require a ${type} room but the school has none.`,
        });
      } else if (over) {
        issues.push({
          severity: 'ERROR',
          scope: 'ROOM',
          message: `${type} rooms can host ${capacity} periods a week but ${demand} are required.`,
        });
      }
      return { type, rooms: count, demand, capacity, over };
    });

    // Total room capacity across all lessons (every lesson needs somewhere).
    const totalDemand = assignments.reduce((n, a) => n + a.periodsPerWeek, 0);
    if (rooms.length > 0 && totalDemand > rooms.length * slotsPerWeek) {
      issues.push({
        severity: 'ERROR',
        scope: 'ROOM',
        message: `All rooms together can host ${rooms.length * slotsPerWeek} periods a week but ${totalDemand} are required.`,
      });
    }

    return {
      academicYear: year,
      teachingDays,
      periods: {
        total: periods.length,
        teachable: teachablePeriods.length,
      },
      slotsPerWeek,
      totals: {
        lessons: totalDemand,
        classes: classes.length,
        staff: staff.length,
        rooms: rooms.length,
      },
      classes,
      staff,
      roomTypes,
      issues,
      /** No blocking problems — generation can be attempted. */
      ready: !issues.some((i) => i.severity === 'ERROR'),
    };
  }
}
