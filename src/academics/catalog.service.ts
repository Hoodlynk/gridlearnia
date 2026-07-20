import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-only view of the curriculum/grading catalogue available to a school:
 * the shared system templates (tenantId = null) plus anything the school owns.
 * Cloning/customizing templates is a later increment; this powers the section
 * assignment pickers.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listCurricula(tenantId: string) {
    return this.prisma.curriculum.findMany({
      where: { OR: [{ tenantId: null }, { tenantId }] },
      select: {
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
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  listGradingSchemes(tenantId: string) {
    return this.prisma.gradingScheme.findMany({
      where: { OR: [{ tenantId: null }, { tenantId }] },
      select: {
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
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }
}
