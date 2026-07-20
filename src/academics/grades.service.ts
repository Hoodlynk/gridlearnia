import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGradeDto, UpdateGradeDto } from './dto/grade.dto';

const gradeSelect = {
  id: true,
  name: true,
  order: true,
  sectionId: true,
  _count: { select: { classes: { where: { deletedAt: null } } } },
} satisfies Prisma.GradeSelect;

@Injectable()
export class GradesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, sectionId: string) {
    await this.assertSection(tenantId, sectionId);
    return this.prisma.grade.findMany({
      where: { tenantId, sectionId, deletedAt: null },
      select: gradeSelect,
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateGradeDto) {
    await this.assertSection(tenantId, dto.sectionId);
    return this.prisma.grade.create({
      data: {
        tenantId,
        sectionId: dto.sectionId,
        name: dto.name,
        order: dto.order,
      },
      select: gradeSelect,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateGradeDto) {
    await this.getOwned(tenantId, id);
    return this.prisma.grade.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
      select: gradeSelect,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.getOwned(tenantId, id);
    const classCount = await this.prisma.class.count({
      where: { gradeId: id, deletedAt: null },
    });
    if (classCount > 0) {
      throw new BadRequestException(
        'This grade still has classes — remove them before deleting the grade',
      );
    }
    await this.prisma.grade.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  private async getOwned(tenantId: string, id: string) {
    const grade = await this.prisma.grade.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!grade) {
      throw new NotFoundException('Grade not found');
    }
    return grade;
  }

  private async assertSection(tenantId: string, sectionId: string) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!section) {
      throw new BadRequestException('Section not found for this school');
    }
  }
}
