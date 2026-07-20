import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarkAttendanceDto } from './dto/attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** The register for a class on a date: every enrolled student with their
   *  status for that day (null if not yet marked). */
  async roster(tenantId: string, classId: string, dateStr: string) {
    await this.assertClass(tenantId, classId);
    const date = this.parseDate(dateStr);

    const enrollments = await this.prisma.enrollment.findMany({
      where: { tenantId, classId, status: 'ENROLLED' },
      select: {
        id: true,
        rollNumber: true,
        student: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ rollNumber: 'asc' }, { student: { lastName: 'asc' } }],
    });

    const records = await this.prisma.attendanceRecord.findMany({
      where: { tenantId, classId, date },
      select: { enrollmentId: true, status: true, note: true },
    });
    const byEnrollment = new Map(records.map((r) => [r.enrollmentId, r]));

    return {
      classId,
      date: dateStr,
      entries: enrollments.map((e) => {
        const rec = byEnrollment.get(e.id);
        return {
          enrollmentId: e.id,
          rollNumber: e.rollNumber,
          student: e.student,
          status: rec?.status ?? null,
          note: rec?.note ?? null,
        };
      }),
    };
  }

  /** Upsert the register for a class on a date. */
  async mark(tenantId: string, dto: MarkAttendanceDto) {
    await this.assertClass(tenantId, dto.classId);
    const date = this.parseDate(dto.date);

    // Every enrollment must belong to this class (and so to this tenant).
    const enrollmentIds = dto.records.map((r) => r.enrollmentId);
    const valid = await this.prisma.enrollment.findMany({
      where: { tenantId, classId: dto.classId, id: { in: enrollmentIds } },
      select: { id: true },
    });
    const validIds = new Set(valid.map((v) => v.id));
    const unknown = enrollmentIds.find((id) => !validIds.has(id));
    if (unknown) {
      throw new BadRequestException(
        'One or more students are not enrolled in this class',
      );
    }

    await this.prisma.$transaction(
      dto.records.map((r) =>
        this.prisma.attendanceRecord.upsert({
          where: {
            enrollmentId_date: { enrollmentId: r.enrollmentId, date },
          },
          create: {
            tenantId,
            classId: dto.classId,
            enrollmentId: r.enrollmentId,
            date,
            status: r.status,
            note: r.note ?? null,
          },
          update: { status: r.status, note: r.note ?? null },
        }),
      ),
    );

    return this.roster(tenantId, dto.classId, dto.date);
  }

  /** Per-student attendance counts for a class over a date range. */
  async summary(
    tenantId: string,
    classId: string,
    fromStr: string,
    toStr: string,
  ) {
    await this.assertClass(tenantId, classId);
    const from = this.parseDate(fromStr);
    const to = this.parseDate(toStr);

    const grouped = await this.prisma.attendanceRecord.groupBy({
      by: ['enrollmentId', 'status'],
      where: { tenantId, classId, date: { gte: from, lte: to } },
      _count: { _all: true },
    });

    const enrollments = await this.prisma.enrollment.findMany({
      where: { tenantId, classId, status: 'ENROLLED' },
      select: {
        id: true,
        student: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ student: { lastName: 'asc' } }],
    });

    const zero = (): Record<AttendanceStatus, number> => ({
      PRESENT: 0,
      ABSENT: 0,
      LATE: 0,
      EXCUSED: 0,
    });
    const counts = new Map<string, Record<AttendanceStatus, number>>();
    for (const g of grouped) {
      const c = counts.get(g.enrollmentId) ?? zero();
      c[g.status] = g._count._all;
      counts.set(g.enrollmentId, c);
    }

    return {
      classId,
      from: fromStr,
      to: toStr,
      rows: enrollments.map((e) => ({
        enrollmentId: e.id,
        student: e.student,
        counts: counts.get(e.id) ?? zero(),
      })),
    };
  }

  private async assertClass(tenantId: string, classId: string) {
    const cls = await this.prisma.class.findFirst({
      where: { id: classId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!cls) {
      throw new BadRequestException('Class not found for this school');
    }
  }

  private parseDate(value: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    // Normalize to a pure date (midnight UTC) to match @db.Date semantics.
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }
}
