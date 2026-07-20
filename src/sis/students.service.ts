import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAndLinkGuardianDto,
  LinkGuardianDto,
} from './dto/guardian.dto';
import { CreateStudentDto, UpdateStudentDto } from './dto/student.dto';

const studentListSelect = {
  id: true,
  admissionNumber: true,
  firstName: true,
  middleName: true,
  lastName: true,
  gender: true,
  status: true,
  campus: { select: { id: true, name: true } },
} satisfies Prisma.StudentSelect;

const studentDetailSelect = {
  ...studentListSelect,
  dateOfBirth: true,
  email: true,
  phone: true,
  address: true,
  photoKey: true,
  admittedOn: true,
  userId: true,
  guardians: {
    select: {
      relationship: true,
      isPrimary: true,
      guardian: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  },
  enrollments: {
    where: { status: 'ENROLLED' },
    select: {
      id: true,
      status: true,
      rollNumber: true,
      class: {
        select: {
          id: true,
          name: true,
          grade: { select: { id: true, name: true } },
        },
      },
      academicYear: { select: { id: true, name: true } },
    },
    orderBy: { enrolledOn: 'desc' },
  },
} satisfies Prisma.StudentSelect;

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    filters: { search?: string; campusId?: string; status?: string },
  ) {
    const search = filters.search?.trim();
    return this.prisma.student.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(filters.campusId ? { campusId: filters.campusId } : {}),
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { admissionNumber: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: studentListSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async get(tenantId: string, id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: studentDetailSelect,
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }

  async create(tenantId: string, dto: CreateStudentDto) {
    await this.assertCampus(tenantId, dto.campusId);
    try {
      return await this.prisma.student.create({
        data: {
          tenantId,
          campusId: dto.campusId,
          admissionNumber: dto.admissionNumber,
          firstName: dto.firstName,
          middleName: dto.middleName ?? null,
          lastName: dto.lastName,
          gender: dto.gender ?? null,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          status: dto.status ?? 'ACTIVE',
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          address: dto.address ?? null,
          admittedOn: dto.admittedOn ? new Date(dto.admittedOn) : null,
        },
        select: studentDetailSelect,
      });
    } catch (e) {
      throw this.mapAdmissionConflict(e);
    }
  }

  async update(tenantId: string, id: string, dto: UpdateStudentDto) {
    await this.getOwned(tenantId, id);
    if (dto.campusId) {
      await this.assertCampus(tenantId, dto.campusId);
    }
    try {
      return await this.prisma.student.update({
        where: { id },
        data: {
          ...(dto.campusId !== undefined ? { campusId: dto.campusId } : {}),
          ...(dto.admissionNumber !== undefined
            ? { admissionNumber: dto.admissionNumber }
            : {}),
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.middleName !== undefined
            ? { middleName: dto.middleName }
            : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
          ...(dto.dateOfBirth !== undefined
            ? { dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          ...(dto.admittedOn !== undefined
            ? { admittedOn: dto.admittedOn ? new Date(dto.admittedOn) : null }
            : {}),
        },
        select: studentDetailSelect,
      });
    } catch (e) {
      throw this.mapAdmissionConflict(e);
    }
  }

  async remove(tenantId: string, id: string) {
    await this.getOwned(tenantId, id);
    const enrolled = await this.prisma.enrollment.count({
      where: { studentId: id, status: 'ENROLLED' },
    });
    if (enrolled > 0) {
      throw new BadRequestException(
        'This student is still actively enrolled — withdraw the enrollment before deleting',
      );
    }
    await this.prisma.student.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  // ----- guardians -----

  async linkGuardian(tenantId: string, studentId: string, dto: LinkGuardianDto) {
    await this.getOwned(tenantId, studentId);
    const guardian = await this.prisma.guardian.findFirst({
      where: { id: dto.guardianId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!guardian) {
      throw new BadRequestException('Guardian not found for this school');
    }
    const existing = await this.prisma.studentGuardian.findUnique({
      where: {
        studentId_guardianId: { studentId, guardianId: dto.guardianId },
      },
      select: { studentId: true },
    });
    if (existing) {
      throw new ConflictException('Guardian is already linked to this student');
    }
    await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.studentGuardian.updateMany({
          where: { studentId },
          data: { isPrimary: false },
        });
      }
      await tx.studentGuardian.create({
        data: {
          studentId,
          guardianId: dto.guardianId,
          relationship: dto.relationship,
          isPrimary: dto.isPrimary ?? false,
        },
      });
    });
    return this.get(tenantId, studentId);
  }

  async createAndLinkGuardian(
    tenantId: string,
    studentId: string,
    dto: CreateAndLinkGuardianDto,
  ) {
    await this.getOwned(tenantId, studentId);
    await this.prisma.$transaction(async (tx) => {
      const guardian = await tx.guardian.create({
        data: {
          tenantId,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          email: dto.email ?? null,
          occupation: dto.occupation ?? null,
          address: dto.address ?? null,
        },
        select: { id: true },
      });
      if (dto.isPrimary) {
        await tx.studentGuardian.updateMany({
          where: { studentId },
          data: { isPrimary: false },
        });
      }
      await tx.studentGuardian.create({
        data: {
          studentId,
          guardianId: guardian.id,
          relationship: dto.relationship,
          isPrimary: dto.isPrimary ?? false,
        },
      });
    });
    return this.get(tenantId, studentId);
  }

  async unlinkGuardian(tenantId: string, studentId: string, guardianId: string) {
    await this.getOwned(tenantId, studentId);
    const link = await this.prisma.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId, guardianId } },
      select: { studentId: true },
    });
    if (!link) {
      throw new NotFoundException('Guardian is not linked to this student');
    }
    await this.prisma.studentGuardian.delete({
      where: { studentId_guardianId: { studentId, guardianId } },
    });
    return this.get(tenantId, studentId);
  }

  // ----- helpers -----

  private async getOwned(tenantId: string, id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
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

  private mapAdmissionConflict(e: unknown) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException(
        'A student with this admission number already exists',
      );
    }
    return e;
  }
}
