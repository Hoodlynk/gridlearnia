import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { MODULES, Module } from '../rbac/rbac.constants';
import {
  DEFAULT_ENABLED_MODULES,
  isCoreModule,
} from './tenant-modules.constants';
import { UpdateTenantModuleDto } from './dto/update-tenant-module.dto';

export interface TenantModuleView {
  moduleKey: Module;
  enabled: boolean;
  /** Core modules can't be disabled — the UI renders their toggle locked. */
  isCore: boolean;
  limits: Prisma.JsonValue;
}

const isKnownModule = (key: string): key is Module =>
  (MODULES as readonly string[]).includes(key);

@Injectable()
export class TenantModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * The full module catalogue for a school. Built from {@link MODULES} and
   * left-joined with stored rows, so a module added to the catalogue after a
   * school was provisioned still appears (at its default state) instead of
   * silently missing.
   */
  async list(tenantId: string): Promise<TenantModuleView[]> {
    await this.assertTenant(tenantId);
    const rows = await this.prisma.tenantModule.findMany({
      where: { tenantId },
    });
    const byKey = new Map(rows.map((row) => [row.moduleKey, row]));

    return MODULES.map((moduleKey) => {
      const row = byKey.get(moduleKey);
      const core = isCoreModule(moduleKey);
      return {
        moduleKey,
        // Core modules are always on, whatever a stale row says.
        enabled: core
          ? true
          : row
            ? row.enabled
            : DEFAULT_ENABLED_MODULES.includes(moduleKey),
        isCore: core,
        limits: row ? row.limits : {},
      };
    });
  }

  /** Enable/disable a module (or set its limits) for a school. */
  async update(
    tenantId: string,
    moduleKey: string,
    dto: UpdateTenantModuleDto,
    actorId: string,
    ip?: string,
  ): Promise<TenantModuleView> {
    await this.assertTenant(tenantId);
    if (!isKnownModule(moduleKey)) {
      throw new BadRequestException(`Unknown module "${moduleKey}"`);
    }
    if (dto.enabled === undefined && dto.limits === undefined) {
      throw new BadRequestException('Nothing to update');
    }
    if (isCoreModule(moduleKey) && dto.enabled === false) {
      throw new BadRequestException(
        `"${moduleKey}" is a core module and cannot be disabled`,
      );
    }

    const defaultEnabled = DEFAULT_ENABLED_MODULES.includes(moduleKey);
    const row = await this.prisma.tenantModule.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey } },
      // Upsert (not update) so catalogue modules with no stored row yet can be
      // toggled — the create seeds the row at the correct baseline.
      create: {
        tenantId,
        moduleKey,
        enabled: dto.enabled ?? defaultEnabled,
        ...(dto.limits !== undefined
          ? { limits: dto.limits as Prisma.InputJsonValue }
          : {}),
      },
      update: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.limits !== undefined
          ? { limits: dto.limits as Prisma.InputJsonValue }
          : {}),
      },
    });

    if (dto.enabled !== undefined) {
      void this.auditService.record({
        action: dto.enabled ? 'MODULE_ENABLED' : 'MODULE_DISABLED',
        tenantId,
        actorId,
        resourceType: 'tenant_module',
        resourceId: moduleKey,
        ip,
        summary: `Module "${moduleKey}" ${dto.enabled ? 'enabled' : 'disabled'}`,
      });
    }

    return {
      moduleKey,
      enabled: row.enabled,
      isCore: isCoreModule(moduleKey),
      limits: row.limits,
    };
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
}
