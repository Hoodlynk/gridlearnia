import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRoomDto,
  GeneratePeriodsDto,
  PeriodInputDto,
  ReplacePeriodsDto,
  ReplaceUnavailabilityDto,
  UpdateRequirementDto,
  UpdateRoomDto,
  UpdateTimetableSettingsDto,
} from './dto/setup.dto';

const DEFAULT_TEACHING_DAYS = [1, 2, 3, 4, 5];

/** "08:30" → 510 */
const toMinutes = (clock: string): number => {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
};

/** 510 → "08:30" */
const toClock = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const roomSelect = {
  id: true,
  name: true,
  code: true,
  type: true,
  capacity: true,
  campus: { select: { id: true, name: true } },
} satisfies Prisma.RoomSelect;

const requirementSelect = {
  id: true,
  periodsPerWeek: true,
  doublePeriods: true,
  requiredRoomType: true,
  preferMorning: true,
  subject: { select: { id: true, code: true, name: true } },
  staff: {
    select: { id: true, firstName: true, lastName: true, staffNumber: true },
  },
  class: {
    select: {
      id: true,
      name: true,
      grade: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.TeachingAssignmentSelect;

@Injectable()
export class TimetableSetupService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Settings ──────────────────────────────────────────────────────────────

  /** Settings are lazily created, so a school never has to "initialise" them. */
  async getSettings(tenantId: string) {
    const existing = await this.prisma.timetableSettings.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;
    return this.prisma.timetableSettings.create({
      data: { tenantId, teachingDays: DEFAULT_TEACHING_DAYS },
    });
  }

  async updateSettings(tenantId: string, dto: UpdateTimetableSettingsDto) {
    if (dto.teachingDays) {
      const unique = [...new Set(dto.teachingDays)].sort((a, b) => a - b);
      if (unique.length !== dto.teachingDays.length) {
        throw new BadRequestException('teachingDays contains duplicates');
      }
      dto = { ...dto, teachingDays: unique };
    }
    await this.getSettings(tenantId); // ensure the row exists
    return this.prisma.timetableSettings.update({
      where: { tenantId },
      data: {
        ...(dto.teachingDays !== undefined
          ? { teachingDays: dto.teachingDays }
          : {}),
        ...(dto.dayStartTime !== undefined
          ? { dayStartTime: dto.dayStartTime }
          : {}),
        ...(dto.lessonDurationMinutes !== undefined
          ? { lessonDurationMinutes: dto.lessonDurationMinutes }
          : {}),
        ...(dto.lessonsPerDay !== undefined
          ? { lessonsPerDay: dto.lessonsPerDay }
          : {}),
        ...(dto.maxPeriodsPerTeacherPerDay !== undefined
          ? { maxPeriodsPerTeacherPerDay: dto.maxPeriodsPerTeacherPerDay }
          : {}),
        ...(dto.maxLessonsPerClassPerDay !== undefined
          ? { maxLessonsPerClassPerDay: dto.maxLessonsPerClassPerDay }
          : {}),
        ...(dto.morningEndsAfterPeriod !== undefined
          ? { morningEndsAfterPeriod: dto.morningEndsAfterPeriod }
          : {}),
      },
    });
  }

  // ── Periods (bell schedule) ───────────────────────────────────────────────

  listPeriods(tenantId: string) {
    return this.prisma.period.findMany({
      where: { tenantId },
      orderBy: { order: 'asc' },
    });
  }

  /**
   * Replace the bell schedule. Rows are matched by `order` and updated in place
   * rather than deleted and recreated — StaffUnavailability cascades off
   * periodId, so recreating would silently wipe every teacher's blocked slots.
   */
  async replacePeriods(tenantId: string, dto: ReplacePeriodsDto) {
    const orders = dto.periods.map((p) => p.order);
    if (new Set(orders).size !== orders.length) {
      throw new BadRequestException('Period orders must be unique');
    }
    for (const p of dto.periods) {
      if (p.startTime >= p.endTime) {
        throw new BadRequestException(
          `"${p.name}" ends at or before it starts`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Drop periods whose slot no longer exists (this does cascade their
      // unavailability rows — unavoidable, the slot itself is gone).
      await tx.period.deleteMany({
        where: { tenantId, order: { notIn: orders } },
      });
      for (const p of dto.periods) {
        await tx.period.upsert({
          where: { tenantId_order: { tenantId, order: p.order } },
          create: {
            tenantId,
            name: p.name,
            order: p.order,
            startTime: p.startTime,
            endTime: p.endTime,
            isBreak: p.isBreak ?? false,
          },
          update: {
            name: p.name,
            startTime: p.startTime,
            endTime: p.endTime,
            isBreak: p.isBreak ?? false,
          },
        });
      }
    });

    return this.listPeriods(tenantId);
  }

  /**
   * Build the bell schedule from the school's own daily layout, then persist it
   * through {@link replacePeriods} (so period IDs — and teachers' blocked slots
   * — survive a regeneration that keeps the same shape).
   */
  async generatePeriods(tenantId: string, dto: GeneratePeriodsDto) {
    const breaks = dto.breaks ?? [];
    const tooLate = breaks.find((b) => b.afterLesson > dto.lessonsPerDay);
    if (tooLate) {
      throw new BadRequestException(
        `"${tooLate.name}" is set after lesson ${tooLate.afterLesson}, but the day only has ${dto.lessonsPerDay} lessons`,
      );
    }

    const label = dto.lessonLabel ?? 'Period';
    const periods: PeriodInputDto[] = [];
    let cursor = toMinutes(dto.dayStartTime);
    let order = 1;

    for (let lesson = 1; lesson <= dto.lessonsPerDay; lesson++) {
      const start = cursor;
      cursor += dto.lessonDurationMinutes;
      periods.push({
        name: `${label} ${lesson}`,
        order: order++,
        startTime: toClock(start),
        endTime: toClock(cursor),
        isBreak: false,
      });

      // Breaks slot in immediately after the lesson they follow. Several may
      // share the same position, and they simply run back to back.
      for (const b of breaks.filter((x) => x.afterLesson === lesson)) {
        const breakStart = cursor;
        cursor += b.durationMinutes;
        periods.push({
          name: b.name,
          order: order++,
          startTime: toClock(breakStart),
          endTime: toClock(cursor),
          isBreak: true,
        });
      }
    }

    if (cursor > 24 * 60) {
      throw new BadRequestException(
        'That layout runs past midnight — shorten the lessons, breaks, or the day',
      );
    }

    // Remember the layout so reopening the builder shows what they chose.
    await this.updateSettings(tenantId, {
      dayStartTime: dto.dayStartTime,
      lessonDurationMinutes: dto.lessonDurationMinutes,
      lessonsPerDay: dto.lessonsPerDay,
    });

    return this.replacePeriods(tenantId, { periods });
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────

  listRooms(tenantId: string, campusId?: string) {
    return this.prisma.room.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(campusId ? { campusId } : {}),
      },
      select: roomSelect,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async createRoom(tenantId: string, dto: CreateRoomDto) {
    await this.assertCampus(tenantId, dto.campusId);
    try {
      return await this.prisma.room.create({
        data: {
          tenantId,
          campusId: dto.campusId,
          name: dto.name,
          code: dto.code,
          type: dto.type ?? 'CLASSROOM',
          capacity: dto.capacity ?? null,
        },
        select: roomSelect,
      });
    } catch (e) {
      throw this.mapRoomCodeConflict(e);
    }
  }

  async updateRoom(tenantId: string, id: string, dto: UpdateRoomDto) {
    await this.getOwnedRoom(tenantId, id);
    if (dto.campusId) {
      await this.assertCampus(tenantId, dto.campusId);
    }
    try {
      return await this.prisma.room.update({
        where: { id },
        data: {
          ...(dto.campusId !== undefined ? { campusId: dto.campusId } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.code !== undefined ? { code: dto.code } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        },
        select: roomSelect,
      });
    } catch (e) {
      throw this.mapRoomCodeConflict(e);
    }
  }

  async removeRoom(tenantId: string, id: string) {
    await this.getOwnedRoom(tenantId, id);
    await this.prisma.room.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  // ── Requirements (stored on TeachingAssignment) ───────────────────────────

  listRequirements(
    tenantId: string,
    filters: { academicYearId?: string; classId?: string },
  ) {
    return this.prisma.teachingAssignment.findMany({
      where: {
        tenantId,
        ...(filters.academicYearId
          ? { academicYearId: filters.academicYearId }
          : {}),
        ...(filters.classId ? { classId: filters.classId } : {}),
      },
      select: requirementSelect,
      orderBy: [{ class: { name: 'asc' } }, { subject: { name: 'asc' } }],
    });
  }

  async updateRequirement(
    tenantId: string,
    id: string,
    dto: UpdateRequirementDto,
  ) {
    const existing = await this.prisma.teachingAssignment.findFirst({
      where: { id, tenantId },
      select: { id: true, periodsPerWeek: true, doublePeriods: true },
    });
    if (!existing) {
      throw new NotFoundException('Teaching assignment not found');
    }

    const periodsPerWeek = dto.periodsPerWeek ?? existing.periodsPerWeek;
    const doublePeriods = dto.doublePeriods ?? existing.doublePeriods;
    // Each double consumes two of the weekly periods, so they must fit.
    if (doublePeriods * 2 > periodsPerWeek) {
      throw new BadRequestException(
        `${doublePeriods} double period(s) need ${doublePeriods * 2} periods, but only ${periodsPerWeek} are allocated`,
      );
    }

    return this.prisma.teachingAssignment.update({
      where: { id },
      data: {
        ...(dto.periodsPerWeek !== undefined
          ? { periodsPerWeek: dto.periodsPerWeek }
          : {}),
        ...(dto.doublePeriods !== undefined
          ? { doublePeriods: dto.doublePeriods }
          : {}),
        ...(dto.requiredRoomType !== undefined
          ? { requiredRoomType: dto.requiredRoomType }
          : {}),
        ...(dto.preferMorning !== undefined
          ? { preferMorning: dto.preferMorning }
          : {}),
      },
      select: requirementSelect,
    });
  }

  // ── Staff unavailability ──────────────────────────────────────────────────

  async getUnavailability(tenantId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId, deletedAt: null },
      select: { id: true, maxPeriodsPerDay: true },
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    const slots = await this.prisma.staffUnavailability.findMany({
      where: { tenantId, staffId },
      select: { day: true, periodId: true, reason: true },
      orderBy: [{ day: 'asc' }],
    });
    return { staffId, maxPeriodsPerDay: staff.maxPeriodsPerDay, slots };
  }

  async replaceUnavailability(
    tenantId: string,
    staffId: string,
    dto: ReplaceUnavailabilityDto,
  ) {
    await this.getUnavailability(tenantId, staffId); // validates ownership

    // Every referenced period must belong to this school.
    if (dto.slots.length > 0) {
      const periodIds = [...new Set(dto.slots.map((s) => s.periodId))];
      const found = await this.prisma.period.findMany({
        where: { tenantId, id: { in: periodIds } },
        select: { id: true },
      });
      if (found.length !== periodIds.length) {
        throw new BadRequestException('Unknown period in unavailability');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.staffUnavailability.deleteMany({ where: { tenantId, staffId } });
      if (dto.slots.length > 0) {
        await tx.staffUnavailability.createMany({
          data: dto.slots.map((s) => ({
            tenantId,
            staffId,
            day: s.day,
            periodId: s.periodId,
            reason: s.reason ?? null,
          })),
          skipDuplicates: true,
        });
      }
      if (dto.maxPeriodsPerDay !== undefined) {
        await tx.staff.update({
          where: { id: staffId },
          data: { maxPeriodsPerDay: dto.maxPeriodsPerDay },
        });
      }
    });

    return this.getUnavailability(tenantId, staffId);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async getOwnedRoom(tenantId: string, id: string) {
    const room = await this.prisma.room.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }

  private async assertCampus(tenantId: string, campusId: string) {
    const campus = await this.prisma.campus.findFirst({
      where: { id: campusId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!campus) {
      throw new BadRequestException('Campus not found for this school');
    }
  }

  private mapRoomCodeConflict(e: unknown) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException('A room with this code already exists');
    }
    return e;
  }
}
