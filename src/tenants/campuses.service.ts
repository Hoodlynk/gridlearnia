import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampusStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampusDto } from './dto/create-campus.dto';
import { UpdateCampusDto } from './dto/update-campus.dto';

const campusSelect = {
  id: true,
  name: true,
  code: true,
  isMain: true,
  status: true,
  address: true,
  phone: true,
  timezone: true,
  createdAt: true,
} satisfies Prisma.CampusSelect;

@Injectable()
export class CampusesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** All live campuses of a school, main first. */
  async list(tenantId: string) {
    await this.assertTenant(tenantId);
    return this.prisma.campus.findMany({
      where: { tenantId, deletedAt: null },
      select: campusSelect,
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(
    tenantId: string,
    dto: CreateCampusDto,
    actorId: string,
    ip?: string,
  ) {
    await this.assertTenant(tenantId);
    const code = dto.code.toUpperCase();
    await this.assertCodeAvailable(tenantId, code);

    const campus = await this.prisma.campus.create({
      data: {
        tenantId,
        name: dto.name,
        code,
        address: dto.address,
        phone: dto.phone,
        timezone: dto.timezone,
        // New campuses are never main — a school always keeps its existing
        // main until one is explicitly promoted.
        isMain: false,
      },
      select: campusSelect,
    });

    void this.auditService.record({
      action: 'CAMPUS_CREATED',
      tenantId,
      actorId,
      resourceType: 'campus',
      resourceId: campus.id,
      metadata: { name: campus.name, code: campus.code },
      ip,
      summary: `Campus "${campus.name}" (${campus.code}) added`,
    });

    return campus;
  }

  async update(
    tenantId: string,
    campusId: string,
    dto: UpdateCampusDto,
    actorId: string,
    ip?: string,
  ) {
    const existing = await this.getLiveCampus(tenantId, campusId);

    const code = dto.code?.toUpperCase();
    if (code && code !== existing.code) {
      await this.assertCodeAvailable(tenantId, code, campusId);
    }

    // Demoting the main campus directly is ambiguous — a school must always
    // have exactly one. Promote another campus instead.
    if (dto.isMain === false && existing.isMain) {
      throw new BadRequestException(
        'Promote another campus to main instead of demoting this one',
      );
    }
    // A main campus can't be deactivated while it holds the main flag.
    if (
      dto.status === CampusStatus.INACTIVE &&
      (dto.isMain ?? existing.isMain)
    ) {
      throw new BadRequestException(
        'Promote another campus to main before deactivating this one',
      );
    }

    const promoting = dto.isMain === true && !existing.isMain;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (promoting) {
        // Exactly one main per tenant: clear the current main first.
        await tx.campus.updateMany({
          where: { tenantId, isMain: true },
          data: { isMain: false },
        });
      }
      return tx.campus.update({
        where: { id: campusId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(code !== undefined ? { code } : {}),
          ...(promoting ? { isMain: true } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        },
        select: campusSelect,
      });
    });

    void this.auditService.record({
      action: 'CAMPUS_UPDATED',
      tenantId,
      actorId,
      resourceType: 'campus',
      resourceId: campusId,
      metadata: { name: updated.name, code: updated.code, promoted: promoting },
      ip,
      summary: `Campus "${updated.name}" (${updated.code}) updated${promoting ? ' — now main' : ''}`,
    });

    return updated;
  }

  /** Soft-delete a campus. The main campus and the last one can't be removed. */
  async remove(
    tenantId: string,
    campusId: string,
    actorId: string,
    ip?: string,
  ) {
    const existing = await this.getLiveCampus(tenantId, campusId);
    if (existing.isMain) {
      throw new BadRequestException(
        'The main campus cannot be deleted — promote another campus first',
      );
    }
    const liveCount = await this.prisma.campus.count({
      where: { tenantId, deletedAt: null },
    });
    if (liveCount <= 1) {
      throw new BadRequestException(
        'A school must keep at least one campus',
      );
    }

    const deleted = await this.prisma.campus.update({
      where: { id: campusId },
      data: { deletedAt: new Date(), status: CampusStatus.INACTIVE },
      select: { id: true, name: true, code: true },
    });

    void this.auditService.record({
      action: 'CAMPUS_DELETED',
      tenantId,
      actorId,
      resourceType: 'campus',
      resourceId: campusId,
      metadata: { name: deleted.name, code: deleted.code },
      ip,
      summary: `Campus "${deleted.name}" (${deleted.code}) deleted`,
    });

    return deleted;
  }

  private async getLiveCampus(tenantId: string, campusId: string) {
    const campus = await this.prisma.campus.findFirst({
      where: { id: campusId, tenantId, deletedAt: null },
      select: { ...campusSelect, isMain: true },
    });
    if (!campus) {
      throw new NotFoundException('Campus not found');
    }
    return campus;
  }

  private async assertTenant(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('School not found');
    }
  }

  private async assertCodeAvailable(
    tenantId: string,
    code: string,
    excludeCampusId?: string,
  ): Promise<void> {
    // The DB unique index on (tenantId, code) spans soft-deleted rows too, so
    // a deleted campus still reserves its code — check without the deletedAt
    // filter, otherwise the insert would fail with an opaque constraint error.
    const clash = await this.prisma.campus.findFirst({
      where: {
        tenantId,
        code,
        ...(excludeCampusId ? { id: { not: excludeCampusId } } : {}),
      },
      select: { id: true, deletedAt: true },
    });
    if (clash) {
      throw new ConflictException(
        clash.deletedAt
          ? `Code "${code}" belonged to a deleted campus — choose another`
          : `A campus with code "${code}" already exists in this school`,
      );
    }
  }
}
