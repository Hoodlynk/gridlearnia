import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateGradingSchemeDto,
  GradingBandDto,
  ReplaceBandsDto,
  UpdateGradingSchemeDto,
} from './dto/grading-scheme.dto';

const schemeSelect = {
  id: true,
  key: true,
  name: true,
  type: true,
  isSystem: true,
  tenantId: true,
  bands: {
    select: {
      id: true,
      label: true,
      order: true,
      minScore: true,
      maxScore: true,
      points: true,
      remark: true,
    },
    orderBy: { order: 'asc' },
  },
} satisfies Prisma.GradingSchemeSelect;

@Injectable()
export class GradingSchemesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Copy a system (or own) scheme into a tenant-owned, editable copy. */
  async clone(tenantId: string, sourceId: string) {
    const source = await this.prisma.gradingScheme.findFirst({
      where: { id: sourceId, OR: [{ tenantId: null }, { tenantId }] },
      include: { bands: true },
    });
    if (!source) {
      throw new NotFoundException('Grading scheme not found');
    }
    await this.assertKeyFree(tenantId, source.key);

    return this.prisma.gradingScheme.create({
      data: {
        tenantId,
        key: source.key,
        name: source.name,
        type: source.type,
        isSystem: false,
        bands: {
          create: source.bands.map((b) => ({
            label: b.label,
            order: b.order,
            minScore: b.minScore,
            maxScore: b.maxScore,
            points: b.points,
            remark: b.remark,
          })),
        },
      },
      select: schemeSelect,
    });
  }

  async create(tenantId: string, dto: CreateGradingSchemeDto) {
    const key = dto.key.toUpperCase();
    await this.assertKeyFree(tenantId, key);
    return this.prisma.gradingScheme.create({
      data: {
        tenantId,
        key,
        name: dto.name,
        type: dto.type,
        isSystem: false,
      },
      select: schemeSelect,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateGradingSchemeDto) {
    await this.getOwned(tenantId, id);
    return this.prisma.gradingScheme.update({
      where: { id },
      data: { ...(dto.name !== undefined ? { name: dto.name } : {}) },
      select: schemeSelect,
    });
  }

  /** Replace the whole band list (simplest correct edit model). */
  async replaceBands(tenantId: string, id: string, dto: ReplaceBandsDto) {
    await this.getOwned(tenantId, id);
    const bands = this.normalizeBands(dto.bands);
    return this.prisma.$transaction(async (tx) => {
      await tx.gradingBand.deleteMany({ where: { schemeId: id } });
      await tx.gradingBand.createMany({
        data: bands.map((b) => ({ ...b, schemeId: id })),
      });
      return tx.gradingScheme.findUniqueOrThrow({
        where: { id },
        select: schemeSelect,
      });
    });
  }

  async remove(tenantId: string, id: string) {
    await this.getOwned(tenantId, id);
    const inUse = await this.prisma.section.count({
      where: { gradingSchemeId: id, deletedAt: null },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        'This grading scheme is assigned to a section — reassign those sections first',
      );
    }
    await this.prisma.gradingScheme.delete({ where: { id } });
    return { id };
  }

  private async getOwned(tenantId: string, id: string) {
    const scheme = await this.prisma.gradingScheme.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!scheme) {
      throw new NotFoundException('Grading scheme not found');
    }
    return scheme;
  }

  private async assertKeyFree(tenantId: string, key: string) {
    const clash = await this.prisma.gradingScheme.findFirst({
      where: { tenantId, key },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        `Your school already has a grading scheme with key "${key}"`,
      );
    }
  }

  private normalizeBands(bands: GradingBandDto[]) {
    const orders = new Set<number>();
    for (const band of bands) {
      if (orders.has(band.order)) {
        throw new BadRequestException(
          `Duplicate band order ${band.order} — each band needs a distinct order`,
        );
      }
      orders.add(band.order);
      if (
        band.minScore !== undefined &&
        band.maxScore !== undefined &&
        band.minScore > band.maxScore
      ) {
        throw new BadRequestException(
          `Band "${band.label}" has min above max`,
        );
      }
    }
    return bands.map((b) => ({
      label: b.label,
      order: b.order,
      minScore: b.minScore,
      maxScore: b.maxScore,
      points: b.points,
      remark: b.remark,
    }));
  }
}
