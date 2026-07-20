import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** A movable cell — the loaded entry plus everything a placement check needs. */
interface EntryRow {
  id: string;
  classId: string;
  staffId: string;
  subjectId: string;
  roomId: string | null;
  day: number;
  periodId: string;
}

/**
 * Manual editing of a generated timetable (Phase 5c).
 *
 * Every check here mirrors the solver's hard constraints, but against the live
 * DB rows — so a drag-and-drop, a "move", or a swap can never introduce a clash.
 * The three unique indexes on TimetableEntry are the final backstop beneath it.
 */
@Injectable()
export class EntryEditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * For one entry, where can it legally go? Returns free (day, period) slots and
   * the other entries it could swap with — exactly what a drag UI highlights.
   */
  async legalMoves(tenantId: string, entryId: string) {
    const { timetableId, entry, entries, periods, teachingDays, unavailable, rooms } =
      await this.load(tenantId, entryId);

    const teachable = periods.filter((p) => !p.isBreak);
    const others = entries.filter((e) => e.id !== entry.id);

    const freeSlots: { day: number; periodId: string }[] = [];
    for (const day of teachingDays) {
      for (const period of teachable) {
        if (day === entry.day && period.id === entry.periodId) continue;
        if (
          this.slotFree(entry, day, period.id, others, unavailable) &&
          this.roomOk(entry, day, period.id, others, rooms)
        ) {
          freeSlots.push({ day, periodId: period.id });
        }
      }
    }

    // Swap targets: trading slots must be legal for BOTH entries.
    const swaps = others
      .filter((other) => {
        const rest = others.filter((e) => e.id !== other.id);
        return (
          this.slotFree(entry, other.day, other.periodId, rest, unavailable) &&
          this.slotFree(other, entry.day, entry.periodId, rest, unavailable)
        );
      })
      .map((e) => e.id);

    return { timetableId, entryId: entry.id, freeSlots, swaps };
  }

  /** Move an entry to a free slot (optionally into a different room). */
  async move(
    tenantId: string,
    entryId: string,
    day: number,
    periodId: string,
    roomId?: string | null,
  ) {
    const { entry, entries, periods, teachingDays, unavailable, rooms } =
      await this.load(tenantId, entryId);

    this.assertTeachableSlot(periods, teachingDays, day, periodId);
    const others = entries.filter((e) => e.id !== entry.id);

    const target: EntryRow = {
      ...entry,
      day,
      periodId,
      roomId: roomId === undefined ? entry.roomId : roomId,
    };
    this.assertPlaceable(target, others, unavailable, rooms);

    try {
      await this.prisma.timetableEntry.update({
        where: { id: entry.id },
        data: { day, periodId, roomId: target.roomId },
      });
    } catch (e) {
      throw this.mapClash(e);
    }
    return { id: entry.id };
  }

  /** Swap two entries' slots (and their rooms travel with them). */
  async swap(tenantId: string, entryId: string, targetEntryId: string) {
    if (entryId === targetEntryId) {
      throw new BadRequestException('Cannot swap an entry with itself');
    }
    const { entry, entries, unavailable, rooms } = await this.load(
      tenantId,
      entryId,
    );
    const target = entries.find((e) => e.id === targetEntryId);
    if (!target) {
      throw new BadRequestException('Target lesson not found in this timetable');
    }

    const rest = entries.filter(
      (e) => e.id !== entry.id && e.id !== target.id,
    );
    const movedEntry: EntryRow = {
      ...entry,
      day: target.day,
      periodId: target.periodId,
      roomId: target.roomId,
    };
    const movedTarget: EntryRow = {
      ...target,
      day: entry.day,
      periodId: entry.periodId,
      roomId: entry.roomId,
    };
    this.assertPlaceable(movedEntry, rest, unavailable, rooms);
    this.assertPlaceable(movedTarget, [...rest, movedEntry], unavailable, rooms);

    // Two-step through a scratch slot so the unique indexes never trip mid-swap.
    await this.prisma.$transaction(async (tx) => {
      await tx.timetableEntry.update({
        where: { id: entry.id },
        data: { day: -1, periodId: entry.periodId },
      });
      await tx.timetableEntry.update({
        where: { id: target.id },
        data: {
          day: entry.day,
          periodId: entry.periodId,
          roomId: entry.roomId,
        },
      });
      await tx.timetableEntry.update({
        where: { id: entry.id },
        data: {
          day: target.day,
          periodId: target.periodId,
          roomId: target.roomId,
        },
      });
    });

    return { entryId: entry.id, targetEntryId: target.id };
  }

  // ── validation ──────────────────────────────────────────────────────────

  /** A class/staff/unavailability check for putting `entry` at (day, period). */
  private slotFree(
    entry: EntryRow,
    day: number,
    periodId: string,
    others: EntryRow[],
    unavailable: Set<string>,
  ): boolean {
    if (unavailable.has(`${entry.staffId}|${day}|${periodId}`)) return false;
    for (const o of others) {
      if (o.day !== day || o.periodId !== periodId) continue;
      if (o.classId === entry.classId) return false;
      if (o.staffId === entry.staffId) return false;
    }
    return true;
  }

  private roomOk(
    entry: EntryRow,
    day: number,
    periodId: string,
    others: EntryRow[],
    rooms: Map<string, boolean>,
  ): boolean {
    if (!entry.roomId) return true;
    if (!rooms.has(entry.roomId)) return false; // room gone
    return !others.some(
      (o) =>
        o.roomId === entry.roomId && o.day === day && o.periodId === periodId,
    );
  }

  private assertPlaceable(
    entry: EntryRow,
    others: EntryRow[],
    unavailable: Set<string>,
    rooms: Map<string, boolean>,
  ): void {
    if (unavailable.has(`${entry.staffId}|${entry.day}|${entry.periodId}`)) {
      throw new BadRequestException(
        'The teacher is unavailable in that slot',
      );
    }
    for (const o of others) {
      if (o.day !== entry.day || o.periodId !== entry.periodId) continue;
      if (o.classId === entry.classId) {
        throw new BadRequestException(
          'The class already has a lesson in that slot',
        );
      }
      if (o.staffId === entry.staffId) {
        throw new BadRequestException(
          'The teacher already has a lesson in that slot',
        );
      }
      if (entry.roomId && o.roomId === entry.roomId) {
        throw new BadRequestException(
          'That room is already in use in that slot',
        );
      }
    }
    if (entry.roomId && !rooms.has(entry.roomId)) {
      throw new BadRequestException('Room not found for this school');
    }
  }

  private assertTeachableSlot(
    periods: { id: string; isBreak: boolean }[],
    teachingDays: number[],
    day: number,
    periodId: string,
  ): void {
    if (!teachingDays.includes(day)) {
      throw new BadRequestException('That day is not a teaching day');
    }
    const period = periods.find((p) => p.id === periodId);
    if (!period) {
      throw new BadRequestException('Period not found for this school');
    }
    if (period.isBreak) {
      throw new BadRequestException('Cannot place a lesson in a break');
    }
  }

  // ── loading ─────────────────────────────────────────────────────────────

  private async load(tenantId: string, entryId: string) {
    const entry = await this.prisma.timetableEntry.findFirst({
      where: { id: entryId, tenantId },
      select: {
        id: true,
        timetableId: true,
        classId: true,
        staffId: true,
        subjectId: true,
        roomId: true,
        day: true,
        periodId: true,
        timetable: { select: { status: true } },
      },
    });
    if (!entry) {
      throw new NotFoundException('Timetable entry not found');
    }
    if (entry.timetable.status === 'ARCHIVED') {
      throw new BadRequestException('Archived timetables are read-only');
    }

    const [entries, periods, settings, unavailRows, rooms] = await Promise.all([
      this.prisma.timetableEntry.findMany({
        where: { tenantId, timetableId: entry.timetableId },
        select: {
          id: true,
          classId: true,
          staffId: true,
          subjectId: true,
          roomId: true,
          day: true,
          periodId: true,
        },
      }),
      this.prisma.period.findMany({
        where: { tenantId },
        select: { id: true, order: true, isBreak: true },
        orderBy: { order: 'asc' },
      }),
      this.prisma.timetableSettings.findUnique({ where: { tenantId } }),
      this.prisma.staffUnavailability.findMany({
        where: { tenantId },
        select: { staffId: true, day: true, periodId: true },
      }),
      this.prisma.room.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true },
      }),
    ]);

    return {
      timetableId: entry.timetableId,
      entry: entry as EntryRow,
      entries: entries as EntryRow[],
      periods,
      teachingDays: settings?.teachingDays ?? [1, 2, 3, 4, 5],
      unavailable: new Set(
        unavailRows.map((u) => `${u.staffId}|${u.day}|${u.periodId}`),
      ),
      rooms: new Map(rooms.map((r) => [r.id, true])),
    };
  }

  private mapClash(e: unknown) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new BadRequestException(
        'That slot is already taken — refresh and try again',
      );
    }
    return e;
  }
}
