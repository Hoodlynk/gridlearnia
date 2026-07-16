import { Injectable } from '@nestjs/common';
import { Prisma, Tenant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenant: Tenant) {
    const [userCount, projectCount] = await this.prisma.$transaction([
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
