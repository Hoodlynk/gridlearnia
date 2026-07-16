import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Tenant, TenantStatus, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_ROOT_ROLE } from '../rbac/rbac.constants';
import { RbacService } from '../rbac/rbac.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    roles: string[];
  };
  tenant: {
    id: string;
    name: string;
    subdomain: string;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly rbacService: RbacService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { subdomain: dto.tenantSubdomain },
    });
    if (existingTenant) {
      throw new ConflictException('Tenant subdomain already exists');
    }

    // The DIRECTOR system role must exist (seeded) before schools can register.
    const directorRole = await this.prisma.role.findFirst({
      where: { key: TENANT_ROOT_ROLE, tenantId: null },
    });
    if (!directorRole) {
      throw new ConflictException(
        'System roles are not seeded — run `npm run prisma:seed` first',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          subdomain: dto.tenantSubdomain,
        },
      });

      const newUser = await tx.user.create({
        data: {
          tenantId: newTenant.id,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
      });

      await tx.userRole.create({
        data: { userId: newUser.id, roleId: directorRole.id },
      });

      return { tenant: newTenant, user: newUser };
    });

    this.logger.log(`New school registered: ${tenant.subdomain}`);

    return this.buildAuthResponse(user, tenant);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { subdomain: dto.tenantSubdomain, deletedAt: null },
    });
    if (!tenant) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (
      tenant.status === TenantStatus.SUSPENDED ||
      tenant.status === TenantStatus.CANCELLED
    ) {
      throw new UnauthorizedException('Tenant account is not active');
    }

    const user = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, email: dto.email, deletedAt: null },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account is locked. Please try again later.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: { increment: 1 },
          lockedUntil:
            user.failedLoginAttempts + 1 >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + LOCK_DURATION_MS)
              : null,
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    this.logger.log(`User logged in: ${user.email} (${tenant.subdomain})`);

    return this.buildAuthResponse(user, tenant);
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
      include: { tenant: true },
    });
    if (!user || user.tenant.deletedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.buildAuthResponse(user, user.tenant);
  }

  private async buildAuthResponse(
    user: User,
    tenant: Tenant,
  ): Promise<AuthResponse> {
    // Slim token: permissions are resolved server-side per request, so role
    // changes/revocations take effect without waiting for token expiry.
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: tenant.id,
      email: user.email,
    };

    const expiresIn = this.configService.getOrThrow<string>(
      'jwt.expiresIn',
    ) as JwtSignOptions['expiresIn'];
    const refreshExpiresIn = this.configService.getOrThrow<string>(
      'jwt.refreshExpiresIn',
    ) as JwtSignOptions['expiresIn'];

    const [accessToken, refreshToken, access] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwt.secret'),
        expiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiresIn,
      }),
      this.rbacService.getAccess(user.id),
    ]);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: access.roles,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
      },
    };
  }
}
