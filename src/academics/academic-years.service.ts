import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAcademicYearDto,
  ReplaceTermsDto,
  TermDto,
  UpdateAcademicYearDto,
} from './dto/academic-year.dto';

const yearSelect = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  isCurrent: true,
  terms: {
    select: {
      id: true,
      name: true,
      order: true,
      startDate: true,
      endDate: true,
    },
    orderBy: { order: 'asc' },
  },
  _count: { select: { classes: true } },
} satisfies Prisma.AcademicYearSelect;

@Injectable()
export class AcademicYearsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.academicYear.findMany({
      where: { tenantId },
      select: yearSelect,
      orderBy: [{ isCurrent: 'desc' }, { name: 'desc' }],
    });
  }

  async create(tenantId: string, dto: CreateAcademicYearDto) {
    await this.assertNameFree(tenantId, dto.name);
    this.assertRange(dto.startDate, dto.endDate);
    const terms = this.normalizeTerms(dto.terms ?? []);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isCurrent) {
        await tx.academicYear.updateMany({
          where: { tenantId, isCurrent: true },
          data: { isCurrent: false },
        });
      }
      return tx.academicYear.create({
        data: {
          tenantId,
          name: dto.name,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          isCurrent: dto.isCurrent ?? false,
          terms: { create: terms },
        },
        select: yearSelect,
      });
    });
  }

  async update(tenantId: string, id: string, dto: UpdateAcademicYearDto) {
    const existing = await this.getOwned(tenantId, id);
    if (dto.name && dto.name !== existing.name) {
      await this.assertNameFree(tenantId, dto.name);
    }
    const start = dto.startDate ?? existing.startDate.toISOString();
    const end = dto.endDate ?? existing.endDate.toISOString();
    this.assertRange(start, end);

    return this.prisma.academicYear.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.startDate !== undefined
          ? { startDate: new Date(dto.startDate) }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: new Date(dto.endDate) }
          : {}),
      },
      select: yearSelect,
    });
  }

  /** Replace the whole term list for a year (simplest correct edit model). */
  async replaceTerms(tenantId: string, id: string, dto: ReplaceTermsDto) {
    await this.getOwned(tenantId, id);
    const terms = this.normalizeTerms(dto.terms);

    return this.prisma.$transaction(async (tx) => {
      await tx.academicTerm.deleteMany({ where: { academicYearId: id } });
      await tx.academicTerm.createMany({
        data: terms.map((term) => ({ ...term, academicYearId: id })),
      });
      return tx.academicYear.findUniqueOrThrow({
        where: { id },
        select: yearSelect,
      });
    });
  }

  async setCurrent(tenantId: string, id: string) {
    await this.getOwned(tenantId, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({
        where: { tenantId, isCurrent: true },
        data: { isCurrent: false },
      });
      return tx.academicYear.update({
        where: { id },
        data: { isCurrent: true },
        select: yearSelect,
      });
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.getOwned(tenantId, id);
    // Deleting a year cascades its classes — refuse while any exist so a
    // click can't wipe a term's worth of class records.
    const classCount = await this.prisma.class.count({
      where: { academicYearId: id },
    });
    if (classCount > 0) {
      throw new BadRequestException(
        'This year has classes — delete or move them before removing the year',
      );
    }
    await this.prisma.academicYear.delete({ where: { id } });
    return { id: existing.id };
  }

  private async getOwned(tenantId: string, id: string) {
    const year = await this.prisma.academicYear.findFirst({
      where: { id, tenantId },
    });
    if (!year) {
      throw new NotFoundException('Academic year not found');
    }
    return year;
  }

  private async assertNameFree(tenantId: string, name: string) {
    const clash = await this.prisma.academicYear.findFirst({
      where: { tenantId, name },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(`An academic year "${name}" already exists`);
    }
  }

  private assertRange(startDate: string, endDate: string) {
    if (new Date(startDate) >= new Date(endDate)) {
      throw new BadRequestException('The start date must be before the end date');
    }
  }

  /** Reject duplicate orders and coerce dates. */
  private normalizeTerms(terms: TermDto[]) {
    const orders = new Set<number>();
    for (const term of terms) {
      if (orders.has(term.order)) {
        throw new BadRequestException(
          `Duplicate term order ${term.order} — each term needs a distinct order`,
        );
      }
      orders.add(term.order);
      this.assertRange(term.startDate, term.endDate);
    }
    return terms.map((term) => ({
      name: term.name,
      order: term.order,
      startDate: new Date(term.startDate),
      endDate: new Date(term.endDate),
    }));
  }
}
