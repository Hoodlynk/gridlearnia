import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_ROOT_ROLE } from '../rbac/rbac.constants';
import { RbacService } from '../rbac/rbac.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Never expose passwordHash — select the safe columns explicitly.
const userSelect = {
  id: true,
  tenantId: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatarUrl: true,
  isActive: true,
  emailVerified: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  userRoles: {
    select: { role: { select: { key: true, name: true } } },
  },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

const toUserDto = ({ userRoles, ...user }: UserRow) => ({
  ...user,
  roles: userRoles.map((ur) => ur.role.key),
});

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService,
  ) {}

  async findAll(tenantId: string, query: ListUsersQueryDto) {
    const where: Prisma.UserWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.role
        ? { userRoles: { some: { role: { key: query.role } } } }
        : {}),
    };

    // Promise.all, not $transaction: two independent reads don't need
    // BEGIN/COMMIT round-trips (expensive against a remote DB).
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: users.map(toUserDto),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: userSelect,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toUserDto(user);
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    const user = await this.findOne(tenantId, id);

    if (
      dto.isActive === false &&
      (await this.rbacService.isLastOrgAdmin(tenantId, id))
    ) {
      throw new ForbiddenException(
        `The last ${TENANT_ROOT_ROLE} of the school cannot be deactivated`,
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: dto,
      select: userSelect,
    });
    return toUserDto(updated);
  }

  async remove(tenantId: string, id: string) {
    const user = await this.findOne(tenantId, id);

    if (await this.rbacService.isLastOrgAdmin(tenantId, id)) {
      throw new ForbiddenException(
        `The last ${TENANT_ROOT_ROLE} of the school cannot be removed`,
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    this.rbacService.invalidate(user.id);

    return { deleted: true };
  }
}
