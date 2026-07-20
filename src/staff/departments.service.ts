import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from './dto/department.dto';

const departmentSelect = {
  id: true,
  name: true,
  code: true,
  head: {
    select: { id: true, firstName: true, lastName: true, staffNumber: true },
  },
  subjects: {
    select: {
      subject: { select: { id: true, code: true, name: true } },
    },
  },
  _count: { select: { members: true } },
} satisfies Prisma.DepartmentSelect;

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const rows = await this.prisma.department.findMany({
      where: { tenantId, deletedAt: null },
      select: departmentSelect,
      orderBy: { name: 'asc' },
    });
    return rows.map(flattenSubjects);
  }

  async create(tenantId: string, dto: CreateDepartmentDto) {
    if (dto.headId) {
      await this.assertStaff(tenantId, dto.headId);
    }
    try {
      const dept = await this.prisma.department.create({
        data: {
          tenantId,
          name: dto.name,
          code: dto.code ?? null,
          headId: dto.headId ?? null,
        },
        select: departmentSelect,
      });
      return flattenSubjects(dept);
    } catch (e) {
      throw this.mapNameConflict(e);
    }
  }

  async update(tenantId: string, id: string, dto: UpdateDepartmentDto) {
    await this.getOwned(tenantId, id);
    if (dto.headId) {
      await this.assertStaff(tenantId, dto.headId);
    }
    try {
      const dept = await this.prisma.department.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.code !== undefined ? { code: dto.code } : {}),
          ...(dto.headId !== undefined ? { headId: dto.headId } : {}),
        },
        select: departmentSelect,
      });
      return flattenSubjects(dept);
    } catch (e) {
      throw this.mapNameConflict(e);
    }
  }

  async remove(tenantId: string, id: string) {
    await this.getOwned(tenantId, id);
    const members = await this.prisma.staff.count({
      where: { tenantId, departmentId: id, deletedAt: null },
    });
    if (members > 0) {
      throw new BadRequestException(
        'This department still has members — move them out first',
      );
    }
    // Subject links cascade; soft-delete the department itself.
    await this.prisma.department.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  async addSubject(tenantId: string, departmentId: string, subjectId: string) {
    await this.getOwned(tenantId, departmentId);
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, OR: [{ tenantId }, { tenantId: null }] },
      select: { id: true },
    });
    if (!subject) {
      throw new BadRequestException('Subject not found for this school');
    }
    const existing = await this.prisma.departmentSubject.findUnique({
      where: { departmentId_subjectId: { departmentId, subjectId } },
      select: { departmentId: true },
    });
    if (existing) {
      throw new ConflictException('Subject is already in this department');
    }
    await this.prisma.departmentSubject.create({
      data: { departmentId, subjectId },
    });
    return this.getReturned(tenantId, departmentId);
  }

  async removeSubject(
    tenantId: string,
    departmentId: string,
    subjectId: string,
  ) {
    await this.getOwned(tenantId, departmentId);
    const link = await this.prisma.departmentSubject.findUnique({
      where: { departmentId_subjectId: { departmentId, subjectId } },
      select: { departmentId: true },
    });
    if (!link) {
      throw new NotFoundException('Subject is not in this department');
    }
    await this.prisma.departmentSubject.delete({
      where: { departmentId_subjectId: { departmentId, subjectId } },
    });
    return this.getReturned(tenantId, departmentId);
  }

  private async getReturned(tenantId: string, id: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: departmentSelect,
    });
    return dept ? flattenSubjects(dept) : null;
  }

  private async getOwned(tenantId: string, id: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!dept) {
      throw new NotFoundException('Department not found');
    }
    return dept;
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

  private mapNameConflict(e: unknown) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new ConflictException(
        'A department with this name already exists',
      );
    }
    return e;
  }
}

// Flatten the nested { subject } join rows into a plain subject list.
function flattenSubjects<
  T extends { subjects: { subject: unknown }[] },
>(dept: T) {
  return { ...dept, subjects: dept.subjects.map((s) => s.subject) };
}
