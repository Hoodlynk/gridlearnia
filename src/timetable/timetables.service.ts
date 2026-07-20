import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTimetableDto,
  PublishTimetableDto,
  UpdateTimetableDto,
} from './dto/timetable.dto';

const timetableSelect = {
  id: true,
  name: true,
  status: true,
  effectiveFrom: true,
  effectiveTo: true,
  publishedAt: true,
  metrics: true,
  academicYear: { select: { id: true, name: true } },
  term: { select: { id: true, name: true } },
} satisfies Prisma.TimetableSelect;

/** Midnight-UTC date, so day comparisons never drift on timezone. */
const toDate = (value: string): Date => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('Invalid date');
  }
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
};

const today = (): Date => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
};

const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const iso = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Timetable versions and their effective periods.
 *
 * A timetable is never "the" timetable — it is the one in force from a date.
 * That lets a school build next term's timetable now, publish it dated ahead,
 * and have it take over automatically without disturbing today's.
 */
@Injectable()
export class TimetablesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, academicYearId?: string) {
    return this.prisma.timetable.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(academicYearId ? { academicYearId } : {}),
      },
      select: timetableSelect,
      orderBy: [{ effectiveFrom: 'desc' }],
    });
  }

  /** The timetable in force on a date (default: today). */
  async activeOn(tenantId: string, dateStr?: string) {
    const date = dateStr ? toDate(dateStr) : today();
    const active = await this.prisma.timetable.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        status: 'PUBLISHED',
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      select: timetableSelect,
      orderBy: { effectiveFrom: 'desc' },
    });
    return { date: iso(date), timetable: active };
  }

  async create(tenantId: string, dto: CreateTimetableDto) {
    const from = toDate(dto.effectiveFrom);
    const to = dto.effectiveTo ? toDate(dto.effectiveTo) : null;
    if (to && to < from) {
      throw new BadRequestException(
        'The end date is before the start date',
      );
    }
    await this.assertYearAndTerm(tenantId, dto.academicYearId, dto.termId, from, to);

    return this.prisma.timetable.create({
      data: {
        tenantId,
        academicYearId: dto.academicYearId,
        termId: dto.termId ?? null,
        name: dto.name,
        effectiveFrom: from,
        effectiveTo: to,
      },
      select: timetableSelect,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateTimetableDto) {
    const existing = await this.getOwned(tenantId, id);

    const from =
      dto.effectiveFrom !== undefined
        ? toDate(dto.effectiveFrom)
        : existing.effectiveFrom;
    const to =
      dto.effectiveTo !== undefined
        ? dto.effectiveTo
          ? toDate(dto.effectiveTo)
          : null
        : existing.effectiveTo;
    if (to && to < from) {
      throw new BadRequestException('The end date is before the start date');
    }
    if (dto.termId !== undefined || dto.effectiveFrom || dto.effectiveTo) {
      await this.assertYearAndTerm(
        tenantId,
        existing.academicYearId,
        dto.termId === undefined ? existing.termId : dto.termId,
        from,
        to,
      );
    }

    // Moving a live timetable's dates must not collide with another live one.
    if (existing.status === 'PUBLISHED') {
      await this.assertNoOverlap(this.prisma, tenantId, from, to, id);
    }

    return this.prisma.timetable.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.termId !== undefined ? { termId: dto.termId } : {}),
        ...(dto.effectiveFrom !== undefined ? { effectiveFrom: from } : {}),
        ...(dto.effectiveTo !== undefined ? { effectiveTo: to } : {}),
      },
      select: timetableSelect,
    });
  }

  /**
   * Put a draft into force. By default this closes the current open-ended
   * timetable the day before, so the school moves cleanly from one to the next.
   */
  async publish(
    tenantId: string,
    id: string,
    userId: string,
    dto: PublishTimetableDto,
  ) {
    const existing = await this.getOwned(tenantId, id);
    if (existing.status === 'PUBLISHED') {
      throw new ConflictException('This timetable is already published');
    }
    if (existing.status === 'ARCHIVED') {
      throw new BadRequestException(
        'Archived timetables cannot be published — duplicate it instead',
      );
    }

    const from = existing.effectiveFrom;
    const to = existing.effectiveTo;

    // A timetable normally starts today or later; backdating is opt-in so a
    // correction is possible but never accidental.
    if (from < today() && !dto.allowBackdate) {
      throw new BadRequestException(
        `This timetable starts on ${iso(from)}, which is in the past. Move the start date forward, or publish with allowBackdate to correct history.`,
      );
    }

    const supersede = dto.supersedeCurrent ?? true;
    const predecessor = supersede ? await this.openEndedBefore(tenantId, from) : null;

    await this.prisma.$transaction(async (tx) => {
      // Close the outgoing timetable first — that is what makes room for this
      // one — then verify no other live version still overlaps. Checking inside
      // the transaction means a clash rolls the whole publish back.
      if (predecessor) {
        await tx.timetable.update({
          where: { id: predecessor.id },
          data: { effectiveTo: addDays(from, -1) },
        });
      }
      await this.assertNoOverlap(tx, tenantId, from, to, id);
      await tx.timetable.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedBy: userId,
        },
      });
    });

    return this.getOne(tenantId, id);
  }

  async archive(tenantId: string, id: string) {
    const existing = await this.getOwned(tenantId, id);
    if (existing.status === 'ARCHIVED') {
      return this.getOne(tenantId, id);
    }
    return this.prisma.timetable.update({
      where: { id },
      data: { status: 'ARCHIVED' },
      select: timetableSelect,
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.getOwned(tenantId, id);
    if (existing.status === 'PUBLISHED') {
      throw new BadRequestException(
        'A published timetable cannot be deleted — archive it instead',
      );
    }
    await this.prisma.timetable.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  async getOne(tenantId: string, id: string) {
    const row = await this.prisma.timetable.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: timetableSelect,
    });
    if (!row) {
      throw new NotFoundException('Timetable not found');
    }
    return row;
  }

  /**
   * The placed lessons of a timetable, optionally narrowed to one class,
   * teacher or room — the three ways a grid is read.
   */
  async entries(
    tenantId: string,
    timetableId: string,
    filters: { classId?: string; staffId?: string; roomId?: string },
  ) {
    await this.getOwned(tenantId, timetableId);
    return this.prisma.timetableEntry.findMany({
      where: {
        tenantId,
        timetableId,
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.staffId ? { staffId: filters.staffId } : {}),
        ...(filters.roomId ? { roomId: filters.roomId } : {}),
      },
      select: {
        id: true,
        day: true,
        period: { select: { id: true, name: true, order: true, startTime: true, endTime: true } },
        class: {
          select: {
            id: true,
            name: true,
            grade: { select: { id: true, name: true } },
          },
        },
        subject: { select: { id: true, code: true, name: true } },
        staff: {
          select: { id: true, firstName: true, lastName: true, staffNumber: true },
        },
        room: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ day: 'asc' }, { period: { order: 'asc' } }],
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async getOwned(tenantId: string, id: string) {
    const row = await this.prisma.timetable.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        status: true,
        effectiveFrom: true,
        effectiveTo: true,
        academicYearId: true,
        termId: true,
      },
    });
    if (!row) {
      throw new NotFoundException('Timetable not found');
    }
    return row;
  }

  /** The live, open-ended timetable that a new one starting on `from` replaces. */
  private openEndedBefore(tenantId: string, from: Date) {
    return this.prisma.timetable.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        status: 'PUBLISHED',
        effectiveTo: null,
        effectiveFrom: { lt: from },
      },
      select: { id: true },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  /**
   * Two published timetables may never cover the same day. Ranges are compared
   * in JS because a null `effectiveTo` means "open ended", which SQL can't
   * express as a plain overlap predicate.
   */
  private async assertNoOverlap(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    from: Date,
    to: Date | null,
    ignoreId: string,
  ) {
    const published = await client.timetable.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: 'PUBLISHED',
        NOT: { id: ignoreId },
      },
      select: { id: true, name: true, effectiveFrom: true, effectiveTo: true },
    });

    const clash = published.find((p) => {
      const startsAfterOther = p.effectiveTo !== null && from > p.effectiveTo;
      const endsBeforeOther = to !== null && to < p.effectiveFrom;
      return !(startsAfterOther || endsBeforeOther);
    });
    if (clash) {
      throw new ConflictException(
        `Dates overlap "${clash.name}" (${iso(clash.effectiveFrom)} – ${
          clash.effectiveTo ? iso(clash.effectiveTo) : 'ongoing'
        }). Adjust the dates or archive that timetable first.`,
      );
    }
  }

  private async assertYearAndTerm(
    tenantId: string,
    academicYearId: string,
    termId: string | null | undefined,
    from: Date,
    to: Date | null,
  ) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id: academicYearId, tenantId },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (!year) {
      throw new BadRequestException('Academic year not found for this school');
    }
    if (from < year.startDate || from > year.endDate) {
      throw new BadRequestException(
        `The start date falls outside ${year.name} (${iso(year.startDate)} – ${iso(year.endDate)})`,
      );
    }
    if (to && (to < year.startDate || to > year.endDate)) {
      throw new BadRequestException(
        `The end date falls outside ${year.name} (${iso(year.startDate)} – ${iso(year.endDate)})`,
      );
    }

    if (termId) {
      const term = await this.prisma.academicTerm.findFirst({
        where: { id: termId, academicYearId },
        select: { id: true },
      });
      if (!term) {
        throw new BadRequestException(
          'Term not found in that academic year',
        );
      }
    }
  }
}
