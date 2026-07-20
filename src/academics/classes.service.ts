import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto, UpdateClassDto } from './dto/class.dto';

const classSelect = {
  id: true,
  name: true,
  grade: {
    select: {
      id: true,
      name: true,
      section: { select: { id: true, name: true } },
    },
  },
  campus: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true } },
  classTeacher: {
    select: { id: true, firstName: true, lastName: true, staffNumber: true },
  },
} satisfies Prisma.ClassSelect;

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, academicYearId: string, gradeId?: string) {
    await this.assertYear(tenantId, academicYearId);
    return this.prisma.class.findMany({
      where: {
        tenantId,
        academicYearId,
        deletedAt: null,
        ...(gradeId ? { gradeId } : {}),
      },
      select: classSelect,
      orderBy: [{ name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateClassDto) {
    // The grade fixes the campus (grade → section → campus); we never take a
    // campus from the client, so a class can't drift to another campus.
    const grade = await this.prisma.grade.findFirst({
      where: { id: dto.gradeId, tenantId, deletedAt: null },
      select: { id: true, section: { select: { campusId: true } } },
    });
    if (!grade) {
      throw new BadRequestException('Grade not found for this school');
    }
    await this.assertYear(tenantId, dto.academicYearId);

    return this.prisma.class.create({
      data: {
        tenantId,
        campusId: grade.section.campusId,
        gradeId: dto.gradeId,
        academicYearId: dto.academicYearId,
        name: dto.name,
      },
      select: classSelect,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateClassDto) {
    await this.getOwned(tenantId, id);
    return this.prisma.class.update({
      where: { id },
      data: { name: dto.name },
      select: classSelect,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.getOwned(tenantId, id);
    await this.prisma.class.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  private async getOwned(tenantId: string, id: string) {
    const cls = await this.prisma.class.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!cls) {
      throw new NotFoundException('Class not found');
    }
    return cls;
  }

  private async assertYear(tenantId: string, academicYearId: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id: academicYearId, tenantId },
      select: { id: true },
    });
    if (!year) {
      throw new BadRequestException('Academic year not found for this school');
    }
  }
}
