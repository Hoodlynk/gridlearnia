import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSectionDto, UpdateSectionDto } from './dto/section.dto';

const sectionSelect = {
  id: true,
  name: true,
  order: true,
  campus: { select: { id: true, name: true } },
  curriculum: { select: { id: true, key: true, name: true } },
  gradingScheme: { select: { id: true, key: true, name: true } },
  _count: { select: { grades: { where: { deletedAt: null } } } },
} satisfies Prisma.SectionSelect;

@Injectable()
export class SectionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, campusId?: string) {
    return this.prisma.section.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(campusId ? { campusId } : {}),
      },
      select: sectionSelect,
      orderBy: [{ campusId: 'asc' }, { order: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateSectionDto) {
    await this.assertCampus(tenantId, dto.campusId);
    await this.assertCurriculum(tenantId, dto.curriculumId);
    await this.assertGradingScheme(tenantId, dto.gradingSchemeId);

    return this.prisma.section.create({
      data: {
        tenantId,
        campusId: dto.campusId,
        name: dto.name,
        order: dto.order ?? 0,
        curriculumId: dto.curriculumId,
        gradingSchemeId: dto.gradingSchemeId,
      },
      select: sectionSelect,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateSectionDto) {
    await this.getOwned(tenantId, id);
    await this.assertCurriculum(tenantId, dto.curriculumId);
    await this.assertGradingScheme(tenantId, dto.gradingSchemeId);

    return this.prisma.section.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.curriculumId !== undefined
          ? { curriculumId: dto.curriculumId }
          : {}),
        ...(dto.gradingSchemeId !== undefined
          ? { gradingSchemeId: dto.gradingSchemeId }
          : {}),
      },
      select: sectionSelect,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.getOwned(tenantId, id);
    const gradeCount = await this.prisma.grade.count({
      where: { sectionId: id, deletedAt: null },
    });
    if (gradeCount > 0) {
      throw new BadRequestException(
        'This section still has grades — remove them before deleting the section',
      );
    }
    await this.prisma.section.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }

  private async getOwned(tenantId: string, id: string) {
    const section = await this.prisma.section.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!section) {
      throw new NotFoundException('Section not found');
    }
    return section;
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

  // A section may reference a system curriculum (tenantId null) or one this
  // school owns — never another school's. null/undefined = no reference.
  private async assertCurriculum(
    tenantId: string,
    curriculumId?: string | null,
  ) {
    if (!curriculumId) return;
    const curriculum = await this.prisma.curriculum.findFirst({
      where: { id: curriculumId, OR: [{ tenantId: null }, { tenantId }] },
      select: { id: true },
    });
    if (!curriculum) {
      throw new BadRequestException('Curriculum is not available to this school');
    }
  }

  private async assertGradingScheme(
    tenantId: string,
    gradingSchemeId?: string | null,
  ) {
    if (!gradingSchemeId) return;
    const scheme = await this.prisma.gradingScheme.findFirst({
      where: { id: gradingSchemeId, OR: [{ tenantId: null }, { tenantId }] },
      select: { id: true },
    });
    if (!scheme) {
      throw new BadRequestException(
        'Grading scheme is not available to this school',
      );
    }
  }
}
