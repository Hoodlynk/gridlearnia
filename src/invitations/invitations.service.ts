import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InvitationStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UNINVITABLE_ROLE_KEYS } from '../rbac/rbac.constants';
import { RbacService } from '../rbac/rbac.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const inviteSelect = {
  id: true,
  email: true,
  roleKeys: true,
  status: true,
  expiresAt: true,
  acceptedAt: true,
  createdAt: true,
};

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacService: RbacService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Invite an email into the school with pre-assigned roles.
   * Returns the raw token ONCE — only its hash is stored.
   * (Email delivery is a TODO; for now the caller shares the token.)
   */
  async create(tenantId: string, invitedBy: string, dto: CreateInvitationDto) {
    const forbidden = dto.roleKeys.filter((key) =>
      UNINVITABLE_ROLE_KEYS.includes(key),
    );
    if (forbidden.length > 0) {
      throw new ForbiddenException(
        `Role(s) cannot be granted via invitation: ${forbidden.join(', ')}`,
      );
    }

    // Validate every role exists (tenant clone or system) before inviting.
    for (const key of dto.roleKeys) {
      await this.rbacService.resolveRole(tenantId, key);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser?.tenantId === tenantId) {
      throw new ConflictException('This user is already in your school');
    }
    if (existingUser?.tenantId) {
      throw new ConflictException('This user already belongs to a school');
    }

    const pending = await this.prisma.invitation.findFirst({
      where: {
        tenantId,
        email: dto.email,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
    });
    if (pending) {
      throw new ConflictException(
        'A pending invitation already exists for this email',
      );
    }

    const token = randomBytes(32).toString('hex');

    const invitation = await this.prisma.invitation.create({
      data: {
        tenantId,
        email: dto.email,
        roleKeys: dto.roleKeys,
        tokenHash: sha256(token),
        invitedBy,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      select: inviteSelect,
    });

    this.logger.log(`Invitation created for ${dto.email}`);

    // TODO: send via email service instead of returning in the response.
    return { ...invitation, token };
  }

  findAll(tenantId: string) {
    return this.prisma.invitation.findMany({
      where: { tenantId },
      select: inviteSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(tenantId: string, id: string) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id, tenantId },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(`Invitation is already ${invitation.status}`);
    }

    return this.prisma.invitation.update({
      where: { id },
      data: { status: InvitationStatus.REVOKED },
      select: inviteSelect,
    });
  }

  /** An authenticated platform user redeems an invite token. */
  async accept(userId: string, token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: { tenant: true },
    });
    if (
      !invitation ||
      invitation.status !== InvitationStatus.PENDING ||
      invitation.expiresAt < new Date()
    ) {
      throw new BadRequestException('Invalid or expired invitation');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.tenantId) {
      throw new ConflictException('You already belong to a school');
    }
    if (user.email !== invitation.email) {
      throw new ForbiddenException(
        'This invitation was issued for a different email address',
      );
    }

    const roles = await Promise.all(
      invitation.roleKeys.map((key) =>
        this.rbacService.resolveRole(invitation.tenantId, key),
      ),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { tenantId: invitation.tenantId },
      });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId, roleId: role.id })),
        skipDuplicates: true,
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
      });
    });

    this.rbacService.invalidate(userId);
    this.logger.log(
      `Invitation accepted: ${user.email} joined ${invitation.tenant.subdomain}`,
    );

    void this.auditService.record({
      action: 'INVITATION_ACCEPTED',
      tenantId: invitation.tenantId,
      actorId: userId,
      resourceType: 'invitation',
      resourceId: invitation.id,
      metadata: { email: user.email, roleKeys: invitation.roleKeys },
      summary: `${user.email} joined ${invitation.tenant.subdomain} as ${invitation.roleKeys.join(' + ')}`,
    });

    return {
      tenant: {
        id: invitation.tenant.id,
        name: invitation.tenant.name,
        subdomain: invitation.tenant.subdomain,
      },
      roles: invitation.roleKeys,
    };
  }
}
