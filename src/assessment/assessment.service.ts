import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAssessmentDto,
  SaveScoresDto,
  UpdateAssessmentDto,
} from './dto/assessment.dto';
import { bandForPercentage } from './grading.util';

const assessmentSelect = {
  id: true,
  name: true,
  maxScore: true,
  date: true,
  termId: true,
  subject: { select: { id: true, code: true, name: true } },
  class: {
    select: {
      id: true,
      name: true,
      grade: { select: { id: true, name: true } },
    },
  },
  academicYear: { select: { id: true, name: true } },
  term: { select: { id: true, name: true } },
  _count: { select: { scores: true } },
} satisfies Prisma.AssessmentSelect;

@Injectable()
export class AssessmentService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    filters: {
      classId?: string;
      academicYearId?: string;
      subjectId?: string;
      termId?: string;
    },
  ) {
    const rows = await this.prisma.assessment.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.academicYearId
          ? { academicYearId: filters.academicYearId }
          : {}),
        ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
        ...(filters.termId ? { termId: filters.termId } : {}),
      },
      select: assessmentSelect,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => ({ ...r, maxScore: Number(r.maxScore) }));
  }

  async create(tenantId: string, dto: CreateAssessmentDto) {
    // The class fixes the academic year, mirroring enrollment/class rules.
    const cls = await this.prisma.class.findFirst({
      where: { id: dto.classId, tenantId, deletedAt: null },
      select: { id: true, academicYearId: true },
    });
    if (!cls) {
      throw new BadRequestException('Class not found for this school');
    }
    await this.assertSubject(tenantId, dto.subjectId);
    if (dto.termId) {
      await this.assertTerm(cls.academicYearId, dto.termId);
    }

    const created = await this.prisma.assessment.create({
      data: {
        tenantId,
        classId: dto.classId,
        subjectId: dto.subjectId,
        academicYearId: cls.academicYearId,
        termId: dto.termId ?? null,
        name: dto.name,
        maxScore: dto.maxScore ?? 100,
        date: dto.date ? new Date(dto.date) : null,
      },
      select: assessmentSelect,
    });
    return { ...created, maxScore: Number(created.maxScore) };
  }

  async update(tenantId: string, id: string, dto: UpdateAssessmentDto) {
    const existing = await this.getOwned(tenantId, id);
    if (dto.termId) {
      await this.assertTerm(existing.academicYearId, dto.termId);
    }
    const updated = await this.prisma.assessment.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.maxScore !== undefined ? { maxScore: dto.maxScore } : {}),
        ...(dto.date !== undefined
          ? { date: dto.date ? new Date(dto.date) : null }
          : {}),
        ...(dto.termId !== undefined ? { termId: dto.termId } : {}),
      },
      select: assessmentSelect,
    });
    return { ...updated, maxScore: Number(updated.maxScore) };
  }

  async remove(tenantId: string, id: string) {
    await this.getOwned(tenantId, id);
    await this.prisma.assessment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  /** The score sheet: every enrolled student, their score (if any), and the
   *  band their percentage maps to under the section's grading scheme. */
  async scores(tenantId: string, assessmentId: string) {
    const assessment = await this.getOwned(tenantId, assessmentId);
    const maxScore = Number(assessment.maxScore);
    const bands = await this.bandsForClass(assessment.classId);

    const enrollments = await this.prisma.enrollment.findMany({
      where: { tenantId, classId: assessment.classId, status: 'ENROLLED' },
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

    const scoreRows = await this.prisma.assessmentScore.findMany({
      where: { assessmentId },
      select: { enrollmentId: true, score: true, remark: true },
    });
    const byEnrollment = new Map(scoreRows.map((s) => [s.enrollmentId, s]));

    return {
      assessmentId,
      maxScore,
      entries: enrollments.map((e) => {
        const row = byEnrollment.get(e.id);
        const score = row ? Number(row.score) : null;
        const pct = score != null && maxScore > 0 ? (score / maxScore) * 100 : null;
        return {
          enrollmentId: e.id,
          rollNumber: e.rollNumber,
          student: e.student,
          score,
          remark: row?.remark ?? null,
          percentage: pct == null ? null : round1(pct),
          band: pct == null ? null : bandForPercentage(bands, pct),
        };
      }),
    };
  }

  async saveScores(tenantId: string, assessmentId: string, dto: SaveScoresDto) {
    const assessment = await this.getOwned(tenantId, assessmentId);
    const maxScore = Number(assessment.maxScore);

    const enrollmentIds = dto.entries.map((e) => e.enrollmentId);
    const valid = await this.prisma.enrollment.findMany({
      where: {
        tenantId,
        classId: assessment.classId,
        id: { in: enrollmentIds },
      },
      select: { id: true },
    });
    const validIds = new Set(valid.map((v) => v.id));
    const unknown = enrollmentIds.find((id) => !validIds.has(id));
    if (unknown) {
      throw new BadRequestException(
        'One or more students are not enrolled in this class',
      );
    }
    const over = dto.entries.find((e) => e.score > maxScore);
    if (over) {
      throw new BadRequestException(
        `A score exceeds the maximum of ${maxScore}`,
      );
    }

    await this.prisma.$transaction(
      dto.entries.map((e) =>
        this.prisma.assessmentScore.upsert({
          where: {
            assessmentId_enrollmentId: {
              assessmentId,
              enrollmentId: e.enrollmentId,
            },
          },
          create: {
            tenantId,
            assessmentId,
            enrollmentId: e.enrollmentId,
            score: e.score,
            remark: e.remark ?? null,
          },
          update: { score: e.score, remark: e.remark ?? null },
        }),
      ),
    );

    return this.scores(tenantId, assessmentId);
  }

  /** A student's report card: scores grouped by subject with per-subject and
   *  overall averages, banded against the section's grading scheme. */
  async reportCard(tenantId: string, enrollmentId: string, termId?: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, tenantId },
      select: {
        id: true,
        classId: true,
        academicYearId: true,
        student: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
          },
        },
        class: {
          select: {
            id: true,
            name: true,
            grade: {
              select: {
                name: true,
                section: { select: { name: true } },
              },
            },
          },
        },
        academicYear: { select: { id: true, name: true } },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    const bands = await this.bandsForClass(enrollment.classId);

    const scoreRows = await this.prisma.assessmentScore.findMany({
      where: {
        enrollmentId,
        assessment: {
          deletedAt: null,
          ...(termId ? { termId } : {}),
        },
      },
      select: {
        score: true,
        assessment: {
          select: {
            id: true,
            name: true,
            maxScore: true,
            subject: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    // Group by subject.
    const bySubject = new Map<
      string,
      {
        subject: { id: string; code: string; name: string };
        items: { name: string; score: number; maxScore: number; percentage: number }[];
      }
    >();
    for (const row of scoreRows) {
      const a = row.assessment;
      const max = Number(a.maxScore);
      const score = Number(row.score);
      const pct = max > 0 ? (score / max) * 100 : 0;
      const key = a.subject.id;
      const group = bySubject.get(key) ?? { subject: a.subject, items: [] };
      group.items.push({
        name: a.name,
        score,
        maxScore: max,
        percentage: round1(pct),
      });
      bySubject.set(key, group);
    }

    const subjects = [...bySubject.values()].map((g) => {
      const avg =
        g.items.reduce((sum, i) => sum + i.percentage, 0) / g.items.length;
      return {
        subject: g.subject,
        assessments: g.items,
        averagePercentage: round1(avg),
        band: bandForPercentage(bands, avg),
      };
    });
    subjects.sort((a, b) => a.subject.name.localeCompare(b.subject.name));

    const overall =
      subjects.length > 0
        ? round1(
            subjects.reduce((s, x) => s + x.averagePercentage, 0) /
              subjects.length,
          )
        : null;

    return {
      enrollmentId,
      student: enrollment.student,
      class: enrollment.class,
      academicYear: enrollment.academicYear,
      termId: termId ?? null,
      subjects,
      overallPercentage: overall,
      overallBand: overall == null ? null : bandForPercentage(bands, overall),
    };
  }

  // ----- helpers -----

  private async getOwned(tenantId: string, id: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, classId: true, academicYearId: true, maxScore: true },
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    return assessment;
  }

  private async assertSubject(tenantId: string, subjectId: string) {
    // Subjects belong either to the tenant or to a shared system curriculum.
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, OR: [{ tenantId }, { tenantId: null }] },
      select: { id: true },
    });
    if (!subject) {
      throw new BadRequestException('Subject not found for this school');
    }
  }

  private async assertTerm(academicYearId: string, termId: string) {
    const term = await this.prisma.academicTerm.findFirst({
      where: { id: termId, academicYearId },
      select: { id: true },
    });
    if (!term) {
      throw new BadRequestException(
        'Term not found in the class academic year',
      );
    }
  }

  private async bandsForClass(classId: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        grade: {
          select: {
            section: {
              select: {
                gradingScheme: {
                  select: {
                    bands: {
                      select: {
                        label: true,
                        order: true,
                        minScore: true,
                        maxScore: true,
                        points: true,
                        remark: true,
                      },
                      orderBy: { order: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    return cls?.grade.section.gradingScheme?.bands ?? [];
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
