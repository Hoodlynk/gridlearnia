import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ROLE_KEYS,
  TENANT_ROOT_ROLE,
  UNASSIGNABLE_ROLE_KEYS,
} from './rbac.constants';

export interface UserAccess {
  roles: string[]; // role keys
  permissions: Set<string>; // "module:action"
}

interface CacheEntry extends UserAccess {
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class RbacService {
  // Per-process cache. TODO: move to Redis when scaling past one instance
  // so role revocation propagates across dynos within the TTL.
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /** Resolve a user's role keys + flattened permission set (cached ~60s). */
  async getAccess(userId: string): Promise<UserAccess> {
    const hit = this.cache.get(userId);
    if (hit && hit.expiresAt > Date.now()) {
      return hit;
    }

    const assignments = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: { permissions: { include: { permission: true } } },
        },
      },
    });

    const roles: string[] = [];
    const permissions = new Set<string>();
    for (const assignment of assignments) {
      roles.push(assignment.role.key);
      for (const rp of assignment.role.permissions) {
        permissions.add(`${rp.permission.module}:${rp.permission.action}`);
      }
    }

    const entry: CacheEntry = {
      roles,
      permissions,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    this.cache.set(userId, entry);
    return entry;
  }

  /** `module:manage` satisfies any action on that module. */
  can(access: UserAccess, required: string): boolean {
    if (access.permissions.has(required)) {
      return true;
    }
    const module = required.split(':')[0];
    return access.permissions.has(`${module}:manage`);
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Resolve a role key for a tenant: a tenant-owned role shadows the
   * system role with the same key (clone-on-write, docs/RBAC.md §10).
   */
  async resolveRole(tenantId: string, key: string): Promise<Role> {
    const role = await this.prisma.role.findFirst({
      where: { key, OR: [{ tenantId }, { tenantId: null }] },
      orderBy: { tenantId: { sort: 'desc', nulls: 'last' } }, // tenant-owned first
    });
    if (!role) {
      throw new NotFoundException(`Role '${key}' does not exist`);
    }
    return role;
  }

  async assignRole(
    tenantId: string,
    actorId: string,
    userId: string,
    roleKey: string,
  ): Promise<{ roles: string[] }> {
    if (UNASSIGNABLE_ROLE_KEYS.includes(roleKey)) {
      throw new ForbiddenException(`Role '${roleKey}' cannot be assigned`);
    }

    await this.assertActorCanAdministerRole(actorId, roleKey);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const role = await this.resolveRole(tenantId, roleKey);

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id },
    });

    this.invalidate(userId);
    return { roles: (await this.getAccess(userId)).roles };
  }

  async removeRole(
    tenantId: string,
    actorId: string,
    userId: string,
    roleKey: string,
  ): Promise<{ roles: string[] }> {
    if (roleKey === TENANT_ROOT_ROLE) {
      throw new ForbiddenException(
        `The ${TENANT_ROOT_ROLE} role cannot be removed`,
      );
    }

    await this.assertActorCanAdministerRole(actorId, roleKey);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const role = await this.resolveRole(tenantId, roleKey);
    const deleted = await this.prisma.userRole.deleteMany({
      where: { userId, roleId: role.id },
    });
    if (deleted.count === 0) {
      throw new BadRequestException(
        `User does not have the '${roleKey}' role`,
      );
    }

    this.invalidate(userId);
    return { roles: (await this.getAccess(userId)).roles };
  }

  /**
   * ORGANIZATION_ADMIN holds user-management:manage itself, so without this
   * check an org admin could mint more org admins. Granting/revoking it is
   * therefore reserved for the DIRECTOR (tenant root).
   */
  private async assertActorCanAdministerRole(
    actorId: string,
    roleKey: string,
  ): Promise<void> {
    if (roleKey !== ROLE_KEYS.ORGANIZATION_ADMIN) {
      return;
    }
    const actorIsDirector = await this.holdsRole(actorId, TENANT_ROOT_ROLE);
    if (!actorIsDirector) {
      throw new ForbiddenException(
        `Only a ${TENANT_ROOT_ROLE} can grant or revoke ${ROLE_KEYS.ORGANIZATION_ADMIN}`,
      );
    }
  }

  /** Does the user hold the given role key? (uncached, for critical checks) */
  async holdsRole(userId: string, roleKey: string): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: { userId, role: { key: roleKey } },
    });
    return count > 0;
  }

  /** Roles visible to a tenant: system roles (minus platform ones) + its own. */
  async listRoles(tenantId: string) {
    const roles = await this.prisma.role.findMany({
      where: {
        key: { notIn: UNASSIGNABLE_ROLE_KEYS },
        OR: [{ tenantId: null }, { tenantId }],
      },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { key: 'asc' }],
    });

    return roles.map((role) => ({
      key: role.key,
      name: role.name,
      isSystem: role.isSystem,
      custom: role.tenantId !== null,
      assignedUsers: role._count.users,
      permissions: role.permissions.map(
        (rp) => `${rp.permission.module}:${rp.permission.action}`,
      ),
    }));
  }

  /** The platform permission catalog, grouped by module. */
  async listPermissionCatalog() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
    const grouped: Record<string, string[]> = {};
    for (const permission of permissions) {
      (grouped[permission.module] ??= []).push(permission.action);
    }
    return grouped;
  }
}
