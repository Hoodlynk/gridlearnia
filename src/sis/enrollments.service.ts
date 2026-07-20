import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEnrollmentDto,
  UpdateEnrollmentDto,
} from './dto/enrollment.dto';

const enrollmentSelect = {
  id: true,
  status: true,
  rollNumber: true,
  enrolledOn: true,
  exitedOn: true,
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
          id: true,
          name: true,
          section: { select: { id: true, name: true } },
        },
      },
    },
  },
  academicYear: { select: { id: true, name: true } },
} satisfies Prisma.EnrollmentSelect;

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    filters: { academicYearId?: string; classId?: string; studentId?: string },
  ) {
    return this.prisma.enrollment.findMany({
      where: {
        tenantId,
        ...(filters.academicYearId
          ? { academicYearId: filters.academicYearId }
          : {}),
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.studentId ? { studentId: filters.studentId } : {}),
      },
      select: enrollmentSelect,
      orderBy: [{ rollNumber: 'asc' }, { enrolledOn: 'desc' }],
    });
  }

  async create(tenantId: string, dto: CreateEnrollmentDto) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!student) {
      throw new BadRequestException('Student not found for this school');
    }

    // The class fixes both the academic year and the campus — we never take
    // them from the client, so an enrollment can't drift to the wrong year/site.
    const cls = await this.prisma.class.findFirst({
      where: { id: dto.classId, tenantId, deletedAt: null },
      select: { id: true, campusId: true, academicYearId: true },
    });
    if (!cls) {
      throw new BadRequestException('Class not found for this school');
    }
    if (cls.academicYearId !== dto.academicYearId) {
      throw new BadRequestException(
        'The chosen class does not belong to that academic year',
      );
    }

    try {
      return await this.prisma.enrollment.create({
        data: {
          tenantId,
          studentId: dto.studentId,
          classId: dto.classId,
          academicYearId: cls.academicYearId,
          campusId: cls.campusId,
          rollNumber: dto.rollNumber ?? null,
        },
        select: enrollmentSelect,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'This student is already enrolled for this academic year',
        );
      }
      throw e;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateEnrollmentDto) {
    const enrollment = await this.getOwned(tenantId, id);

    let campusId: string | undefined;
    if (dto.classId && dto.classId !== enrollment.classId) {
      const cls = await this.prisma.class.findFirst({
        where: { id: dto.classId, tenantId, deletedAt: null },
        select: { id: true, campusId: true, academicYearId: true },
      });
      if (!cls) {
        throw new BadRequestException('Class not found for this school');
      }
      // A transfer stays within the same academic year — a new year is a new
      // enrollment, not an edit to this one.
      if (cls.academicYearId !== enrollment.academicYearId) {
        throw new BadRequestException(
          'A student can only move to a class in the same academic year',
        );
      }
      campusId = cls.campusId;
    }

    return this.prisma.enrollment.update({
      where: { id },
      data: {
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(campusId !== undefined ? { campusId } : {}),
        ...(dto.rollNumber !== undefined ? { rollNumber: dto.rollNumber } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.exitedOn !== undefined
          ? { exitedOn: dto.exitedOn ? new Date(dto.exitedOn) : null }
          : {}),
      },
      select: enrollmentSelect,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.getOwned(tenantId, id);
    await this.prisma.enrollment.delete({ where: { id } });
    return { id };
  }

  private async getOwned(tenantId: string, id: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id, tenantId },
      select: { id: true, classId: true, academicYearId: true },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    return enrollment;
  }
}
