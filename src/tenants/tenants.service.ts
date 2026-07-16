import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Tenant } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformUpdateTenantDto } from './dto/platform-update-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

const platformTenantSelect = {
  id: true,
  name: true,
  subdomain: true,
  tier: true,
  status: true,
  maxUsers: true,
  createdAt: true,
  _count: {
    select: { users: { where: { deletedAt: null } } },
  },
} satisfies Prisma.TenantSelect;

type PlatformTenantRow = Prisma.TenantGetPayload<{
  select: typeof platformTenantSelect;
}>;

function toPlatformTenant({ _count, ...tenant }: PlatformTenantRow) {
  return { ...tenant, usersCount: _count.users };
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getOverview(tenant: Tenant) {
    const [userCount, projectCount] = await Promise.all([
      this.prisma.user.count({
        where: { tenantId: tenant.id, deletedAt: null },
      }),
      this.prisma.project.count({
        where: { tenantId: tenant.id, deletedAt: null },
      }),
    ]);

    return {
      id: tenant.id,
      name: tenant.name,
      subdomain: tenant.subdomain,
      tier: tenant.tier,
      status: tenant.status,
      settings: tenant.settings,
      limits: {
        maxUsers: tenant.maxUsers,
        maxStorageGb: tenant.maxStorageGb,
        maxApiCallsPerDay: tenant.maxApiCallsPerDay,
      },
      usage: {
        users: userCount,
        projects: projectCount,
      },
      createdAt: tenant.createdAt,
    };
  }

  /** Platform (SUPER_ADMIN) listing: every school with its user count. */
  async listForPlatform() {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: platformTenantSelect,
      orderBy: { createdAt: 'desc' },
    });

    return tenants.map(toPlatformTenant);
  }

  /** Platform (SUPER_ADMIN) update: tier, status, or user cap. */
  async updateForPlatform(
    tenantId: string,
    dto: PlatformUpdateTenantDto,
    actorId: string,
    ip?: string,
  ) {
    const existing = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('School not found');
    }

    const changes: string[] = [];
    if (dto.tier !== undefined && dto.tier !== existing.tier) {
      changes.push(`tier ${existing.tier}→${dto.tier}`);
    }
    if (dto.status !== undefined && dto.status !== existing.status) {
      changes.push(`status ${existing.status}→${dto.status}`);
    }
    if (dto.maxUsers !== undefined && dto.maxUsers !== existing.maxUsers) {
      changes.push(`maxUsers ${existing.maxUsers}→${dto.maxUsers}`);
    }
    if (changes.length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.tier !== undefined ? { tier: dto.tier } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.maxUsers !== undefined ? { maxUsers: dto.maxUsers } : {}),
      },
      select: platformTenantSelect,
    });

    void this.auditService.record({
      action: 'TENANT_UPDATED',
      tenantId,
      actorId,
      resourceType: 'tenant',
      resourceId: tenantId,
      metadata: { changes },
      ip,
      summary: `School ${existing.name} updated: ${changes.join(', ')}`,
      // Losing access to a whole school is always worth an alert.
      critical:
        dto.status === 'SUSPENDED' || dto.status === 'CANCELLED',
    });

    return toPlatformTenant(updated);
  }

  /** Platform (SUPER_ADMIN) delete: soft-deletes the school. */
  async deleteForPlatform(tenantId: string, actorId: string, ip?: string) {
    const existing = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('School not found');
    }

    const deleted = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { deletedAt: new Date(), status: 'CANCELLED' },
      select: { id: true, name: true, subdomain: true, deletedAt: true },
    });

    void this.auditService.record({
      action: 'TENANT_DELETED',
      tenantId,
      actorId,
      resourceType: 'tenant',
      resourceId: tenantId,
      metadata: { name: existing.name, subdomain: existing.subdomain },
      ip,
      summary: `School ${existing.name} (${existing.subdomain}) deleted`,
      critical: true,
    });

    return deleted;
  }

  update(tenantId: string, dto: UpdateTenantDto) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.settings !== undefined
          ? { settings: dto.settings as Prisma.InputJsonValue }
          : {}),
      },
      select: {
        id: true,
        name: true,
        subdomain: true,
        tier: true,
        status: true,
        settings: true,
        updatedAt: true,
      },
    });
  }
}
