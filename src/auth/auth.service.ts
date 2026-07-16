import {
  ConflictException,
  ForbiddenException,
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
  } | null;
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

  /**
   * Platform-level registration: creates a user with no school and no roles
   * (⇒ empty permission set). Users get a school by requesting one
   * (SUPER_ADMIN approval) or accepting an invitation.
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });

    this.logger.log(`New platform user registered: ${user.email}`);

    return this.buildAuthResponse(user, null);
  }

  async login(dto: LoginDto, ip?: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      include: { tenant: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
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
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    if (
      user.tenant &&
      (user.tenant.deletedAt ||
        user.tenant.status === TenantStatus.SUSPENDED ||
        user.tenant.status === TenantStatus.CANCELLED)
    ) {
      throw new UnauthorizedException('Tenant account is not active');
    }

    // Bookkeeping — doesn't gate the login, so don't make the user wait on it
    void this.prisma.user
      .update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
          lastLoginIp: ip ?? null,
        },
      })
      .catch((error) =>
        this.logger.error(
          `Failed to record login bookkeeping for ${user.email}`,
          error instanceof Error ? error.stack : String(error),
        ),
      );

    this.logger.log(
      `User logged in: ${user.email}${user.tenant ? ` (${user.tenant.subdomain})` : ' (platform)'} ip=${ip ?? 'unknown'}`,
    );

    return this.buildAuthResponse(user, user.tenant);
  }

  /**
   * Dedicated platform-console login: same credential flow, but the backend
   * itself refuses non-SUPER_ADMIN accounts — the frontend never has to.
   */
  async adminLogin(dto: LoginDto, ip?: string): Promise<AuthResponse> {
    const response = await this.login(dto, ip);
    if (!response.user.roles.includes('SUPER_ADMIN')) {
      this.logger.warn(
        `Admin console login denied for non-admin account: ${dto.email} ip=${ip ?? 'unknown'}`,
      );
      throw new ForbiddenException(
        'This console is restricted to platform administrators',
      );
    }
    return response;
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
    if (!user || (user.tenant && user.tenant.deletedAt)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.buildAuthResponse(user, user.tenant);
  }

  private async buildAuthResponse(
    user: User,
    tenant: Tenant | null,
  ): Promise<AuthResponse> {
    // Slim token: permissions are resolved server-side per request, so role
    // changes/revocations take effect without waiting for token expiry.
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: tenant?.id ?? null,
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
      tenant: tenant
        ? { id: tenant.id, name: tenant.name, subdomain: tenant.subdomain }
        : null,
    };
  }
}
