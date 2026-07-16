import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SchoolRequestStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_ROOT_ROLE } from '../rbac/rbac.constants';
import { RbacService } from '../rbac/rbac.service';
import { CreateSchoolRequestDto } from './dto/create-school-request.dto';

const requestSelect = {
  id: true,
  name: true,
  subdomain: true,
  status: true,
  reason: true,
  reviewedAt: true,
  createdAt: true,
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
};

@Injectable()
export class SchoolRequestsService {
  private readonly logger = new Logger(SchoolRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService,
    private readonly auditService: AuditService,
  ) {}

  /** A platform user (no school yet) applies to create one. */
  async create(userId: string, dto: CreateSchoolRequestDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.tenantId) {
      throw new ConflictException('You already belong to a school');
    }

    const pending = await this.prisma.schoolRequest.findFirst({
      where: { userId, status: SchoolRequestStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException('You already have a pending school request');
    }

    await this.assertSubdomainAvailable(dto.subdomain);

    const request = await this.prisma.schoolRequest.create({
      data: { userId, name: dto.name, subdomain: dto.subdomain },
      select: requestSelect,
    });

    this.logger.log(
      `School request created: ${dto.subdomain} by ${user.email}`,
    );
    return request;
  }

  async findMine(userId: string) {
    return this.prisma.schoolRequest.findMany({
      where: { userId },
      select: requestSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Platform (SUPER_ADMIN) listing. */
  async findAll(status?: SchoolRequestStatus) {
    return this.prisma.schoolRequest.findMany({
      where: status ? { status } : {},
      select: requestSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Platform (SUPER_ADMIN) status counts — one grouped count query. */
  async stats() {
    const grouped = await this.prisma.schoolRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const row of grouped) {
      counts[row.status] = row._count._all;
    }
    return counts;
  }

  /**
   * SUPER_ADMIN approval: creates the tenant and binds the requester as its
   * ORGANIZATION_ADMIN in one transaction. The org-admin grant only ever
   * happens here — there is no standing "school creator" role.
   */
  async approve(requestId: string, reviewerId: string) {
    const request = await this.prisma.schoolRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });
    if (!request) {
      throw new NotFoundException('School request not found');
    }
    if (request.status !== SchoolRequestStatus.PENDING) {
      throw new BadRequestException(`Request is already ${request.status}`);
    }
    if (request.user.tenantId) {
      throw new ConflictException(
        'The requester has joined another school since applying',
      );
    }

    // Exclude the request being approved from its own conflict check.
    await this.assertSubdomainAvailable(request.subdomain, request.id);

    const rootRole = await this.prisma.role.findFirst({
      where: { key: TENANT_ROOT_ROLE, tenantId: null },
    });
    if (!rootRole) {
      throw new BadRequestException(
        'System roles are not seeded — run `npm run prisma:seed` first',
      );
    }

    const tenant = await this.prisma.$transaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: { name: request.name, subdomain: request.subdomain },
      });
      await tx.user.update({
        where: { id: request.userId },
        data: { tenantId: newTenant.id },
      });
      await tx.userRole.create({
        data: { userId: request.userId, roleId: rootRole.id },
      });
      await tx.schoolRequest.update({
        where: { id: request.id },
        data: {
          status: SchoolRequestStatus.APPROVED,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
        },
      });
      return newTenant;
    });

    this.rbacService.invalidate(request.userId);
    this.logger.log(
      `School approved: ${tenant.subdomain} (org admin: ${request.user.email})`,
    );

    void this.auditService.record({
      action: 'SCHOOL_REQUEST_APPROVED',
      tenantId: tenant.id,
      actorId: reviewerId,
      resourceType: 'school_request',
      resourceId: request.id,
      metadata: {
        school: tenant.name,
        subdomain: tenant.subdomain,
        organizationAdmin: request.user.email,
      },
      summary: `School "${tenant.name}" (${tenant.subdomain}) approved — ${TENANT_ROOT_ROLE}: ${request.user.email}`,
      critical: true, // creates a tenant root
    });

    return {
      request: { id: request.id, status: SchoolRequestStatus.APPROVED },
      tenant: { id: tenant.id, name: tenant.name, subdomain: tenant.subdomain },
      organizationAdmin: { id: request.userId, email: request.user.email },
    };
  }

  async reject(requestId: string, reviewerId: string, reason?: string) {
    const request = await this.prisma.schoolRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('School request not found');
    }
    if (request.status !== SchoolRequestStatus.PENDING) {
      throw new BadRequestException(`Request is already ${request.status}`);
    }

    const rejected = await this.prisma.schoolRequest.update({
      where: { id: requestId },
      data: {
        status: SchoolRequestStatus.REJECTED,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reason,
      },
      select: requestSelect,
    });

    void this.auditService.record({
      action: 'SCHOOL_REQUEST_REJECTED',
      actorId: reviewerId,
      resourceType: 'school_request',
      resourceId: requestId,
      metadata: { school: request.name, subdomain: request.subdomain, reason },
      summary: `School request "${request.name}" (${request.subdomain}) rejected`,
    });

    return rejected;
  }

  private async assertSubdomainAvailable(
    subdomain: string,
    excludeRequestId?: string,
  ): Promise<void> {
    const [tenant, pendingRequest] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { subdomain } }),
      this.prisma.schoolRequest.findFirst({
        where: {
          subdomain,
          status: SchoolRequestStatus.PENDING,
          ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
        },
      }),
    ]);
    if (tenant || pendingRequest) {
      throw new ConflictException('Subdomain is already taken or requested');
    }
  }
}
