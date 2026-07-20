import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTeachingAssignmentDto,
  SetClassTeacherDto,
} from './dto/teaching-assignment.dto';

const assignmentSelect = {
  id: true,
  staff: {
    select: { id: true, firstName: true, lastName: true, staffNumber: true },
  },
  subject: { select: { id: true, code: true, name: true } },
  class: {
    select: {
      id: true,
      name: true,
      grade: { select: { id: true, name: true } },
    },
  },
  academicYear: { select: { id: true, name: true } },
} satisfies Prisma.TeachingAssignmentSelect;

@Injectable()
export class TeachingAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    filters: { classId?: string; staffId?: string; academicYearId?: string },
  ) {
    return this.prisma.teachingAssignment.findMany({
      where: {
        tenantId,
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.staffId ? { staffId: filters.staffId } : {}),
        ...(filters.academicYearId
          ? { academicYearId: filters.academicYearId }
          : {}),
      },
      select: assignmentSelect,
      orderBy: [{ subject: { name: 'asc' } }],
    });
  }

  async create(tenantId: string, dto: CreateTeachingAssignmentDto) {
    await this.assertStaff(tenantId, dto.staffId);
    await this.assertSubject(tenantId, dto.subjectId);
    // The class fixes the academic year (never taken from the client).
    const cls = await this.prisma.class.findFirst({
      where: { id: dto.classId, tenantId, deletedAt: null },
      select: { id: true, academicYearId: true },
    });
    if (!cls) {
      throw new BadRequestException('Class not found for this school');
    }

    try {
      return await this.prisma.teachingAssignment.create({
        data: {
          tenantId,
          staffId: dto.staffId,
          classId: dto.classId,
          subjectId: dto.subjectId,
          academicYearId: cls.academicYearId,
        },
        select: assignmentSelect,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'This teacher is already assigned to that subject in that class',
        );
      }
      throw e;
    }
  }

  async remove(tenantId: string, id: string) {
    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!assignment) {
      throw new NotFoundException('Teaching assignment not found');
    }
    await this.prisma.teachingAssignment.delete({ where: { id } });
    return { id };
  }

  async setClassTeacher(tenantId: string, dto: SetClassTeacherDto) {
    const cls = await this.prisma.class.findFirst({
      where: { id: dto.classId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!cls) {
      throw new BadRequestException('Class not found for this school');
    }
    if (dto.staffId) {
      await this.assertStaff(tenantId, dto.staffId);
    }
    return this.prisma.class.update({
      where: { id: dto.classId },
      data: { classTeacherId: dto.staffId ?? null },
      select: {
        id: true,
        name: true,
        classTeacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffNumber: true,
          },
        },
      },
    });
  }

  private async assertStaff(tenantId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!staff) {
      throw new BadRequestException('Staff member not found for this school');
    }
  }

  private async assertSubject(tenantId: string, subjectId: string) {
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, OR: [{ tenantId }, { tenantId: null }] },
      select: { id: true },
    });
    if (!subject) {
      throw new BadRequestException('Subject not found for this school');
    }
  }
}
