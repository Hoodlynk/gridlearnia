import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCurriculumDto,
  CreateSubjectDto,
  UpdateCurriculumDto,
  UpdateSubjectDto,
} from './dto/curriculum.dto';

const curriculumSelect = {
  id: true,
  key: true,
  name: true,
  country: true,
  isSystem: true,
  tenantId: true,
  subjects: {
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  },
} satisfies Prisma.CurriculumSelect;

@Injectable()
export class CurriculaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Copy a system (or own) curriculum into a tenant-owned, editable copy. */
  async clone(tenantId: string, sourceId: string) {
    const source = await this.prisma.curriculum.findFirst({
      where: { id: sourceId, OR: [{ tenantId: null }, { tenantId }] },
      include: { subjects: true },
    });
    if (!source) {
      throw new NotFoundException('Curriculum not found');
    }
    await this.assertKeyFree(tenantId, source.key);

    return this.prisma.curriculum.create({
      data: {
        tenantId,
        key: source.key,
        name: source.name,
        country: source.country,
        isSystem: false,
        subjects: {
          create: source.subjects.map((s) => ({
            tenantId,
            code: s.code,
            name: s.name,
          })),
        },
      },
      select: curriculumSelect,
    });
  }

  async create(tenantId: string, dto: CreateCurriculumDto) {
    const key = dto.key.toUpperCase();
    await this.assertKeyFree(tenantId, key);
    return this.prisma.curriculum.create({
      data: {
        tenantId,
        key,
        name: dto.name,
        country: dto.country?.toUpperCase(),
        isSystem: false,
      },
      select: curriculumSelect,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCurriculumDto) {
    await this.getOwned(tenantId, id);
    return this.prisma.curriculum.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.country !== undefined
          ? { country: dto.country.toUpperCase() }
          : {}),
      },
      select: curriculumSelect,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.getOwned(tenantId, id);
    const inUse = await this.prisma.section.count({
      where: { curriculumId: id, deletedAt: null },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        'This curriculum is assigned to a section — reassign those sections first',
      );
    }
    await this.prisma.curriculum.delete({ where: { id } });
    return { id };
  }

  async addSubject(tenantId: string, curriculumId: string, dto: CreateSubjectDto) {
    await this.getOwned(tenantId, curriculumId);
    const code = dto.code.toUpperCase();
    await this.assertSubjectCodeFree(curriculumId, code);
    return this.prisma.subject.create({
      data: { tenantId, curriculumId, code, name: dto.name },
      select: { id: true, code: true, name: true },
    });
  }

  async updateSubject(
    tenantId: string,
    curriculumId: string,
    subjectId: string,
    dto: UpdateSubjectDto,
  ) {
    await this.getOwned(tenantId, curriculumId);
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, curriculumId },
      select: { id: true, code: true },
    });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    const code = dto.code?.toUpperCase();
    if (code && code !== subject.code) {
      await this.assertSubjectCodeFree(curriculumId, code);
    }
    return this.prisma.subject.update({
      where: { id: subjectId },
      data: {
        ...(code !== undefined ? { code } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
      },
      select: { id: true, code: true, name: true },
    });
  }

  async removeSubject(
    tenantId: string,
    curriculumId: string,
    subjectId: string,
  ) {
    await this.getOwned(tenantId, curriculumId);
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, curriculumId },
      select: { id: true },
    });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    await this.prisma.subject.delete({ where: { id: subjectId } });
    return { id: subjectId };
  }

  // Tenant-owned only: system curricula have tenantId = null, so this never
  // matches them — schools can't edit shared templates.
  private async getOwned(tenantId: string, id: string) {
    const curriculum = await this.prisma.curriculum.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!curriculum) {
      throw new NotFoundException('Curriculum not found');
    }
    return curriculum;
  }

  private async assertKeyFree(tenantId: string, key: string) {
    const clash = await this.prisma.curriculum.findFirst({
      where: { tenantId, key },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        `Your school already has a curriculum with key "${key}"`,
      );
    }
  }

  private async assertSubjectCodeFree(curriculumId: string, code: string) {
    const clash = await this.prisma.subject.findFirst({
      where: { curriculumId, code },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(`Subject code "${code}" already exists`);
    }
  }
}
