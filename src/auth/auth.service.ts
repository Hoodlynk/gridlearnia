import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Tenant, TenantStatus, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'crypto';
import { JwtPayload } from '../common/types';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
// Reset links gate account takeover, so they live much shorter than
// verification links. Keep in sync with the copy in the reset email template.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
// Email 2FA codes: short-lived, few guesses. The challenge token outlives
// the code slightly so a resent code still fits inside the same challenge.
const TWO_FACTOR_CODE_TTL_MINUTES = 10;
const TWO_FACTOR_CODE_TTL_MS = TWO_FACTOR_CODE_TTL_MINUTES * 60 * 1000;
const TWO_FACTOR_MAX_ATTEMPTS = 5;
const TWO_FACTOR_CHALLENGE_TTL = '15m';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

// Show just enough of the address for the user to know where the code went.
const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
};

// Which login door issued the challenge — verify re-enforces the same role
// gate, so a school challenge can never mint an admin-console session.
type TwoFactorPortal = 'school' | 'admin';

interface TwoFactorTokenPayload {
  sub: string;
  email: string;
  portal: TwoFactorPortal;
  purpose: '2fa';
}

/** Step-1 login response: no tokens yet, a code is in the user's inbox. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  /** Masked — safe to show in the UI ("code sent to ja***@…"). */
  email: string;
  expiresInMinutes: number;
}

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
    private readonly mailService: MailService,
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

    // Fire-and-forget: registration never fails because email delivery did.
    void this.issueAndSendVerification(user.id, user.email);

    return this.buildAuthResponse(user, null);
  }

  /** Consume a verification link token and mark the account verified. */
  async verifyEmail(token: string) {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt < new Date() ||
      record.user.deletedAt
    ) {
      throw new BadRequestException('Invalid or expired verification link');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
    ]);

    this.logger.log(`Email verified: ${record.user.email}`);
    return { verified: true, email: record.user.email };
  }

  /** Re-send the verification email; previous unused links stop working. */
  async resendVerification(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId, usedAt: null },
    });
    await this.issueAndSendVerification(userId, user.email);
    return { sent: true };
  }

  private async issueAndSendVerification(
    userId: string,
    email: string,
  ): Promise<void> {
    try {
      const token = randomBytes(32).toString('hex');
      await this.prisma.emailVerificationToken.create({
        data: {
          userId,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
        },
      });
      await this.mailService.sendVerificationEmail(email, token);
    } catch (error) {
      this.logger.error(
        `Could not issue verification email for ${email}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Issue a password reset link. Always answers generically — whether the
   * email exists, is soft-deleted, or the send fails, the caller learns
   * nothing about account existence.
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (user) {
      // Fire-and-forget: the response must not vary with delivery outcome.
      void this.issueAndSendPasswordReset(user.id, user.email);
    }

    return { sent: true };
  }

  private async issueAndSendPasswordReset(
    userId: string,
    email: string,
  ): Promise<void> {
    try {
      // Previous unused links stop working — only the newest reset is live.
      await this.prisma.passwordResetToken.deleteMany({
        where: { userId, usedAt: null },
      });
      const token = randomBytes(32).toString('hex');
      await this.prisma.passwordResetToken.create({
        data: {
          userId,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
      await this.mailService.sendPasswordResetEmail(email, token);
    } catch (error) {
      this.logger.error(
        `Could not issue password reset email for ${email}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** Consume a reset link token and set the new password. */
  async resetPassword(token: string, password: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt < new Date() ||
      record.user.deletedAt
    ) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        // A successful reset proves control of the mailbox — clear any
        // brute-force lockout so the user can sign in immediately.
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
    ]);

    this.logger.log(`Password reset: ${record.user.email}`);
    return { reset: true };
  }

  /**
   * School-app login, step 1. SUPER_ADMIN accounts are refused here — the
   * backend itself enforces the console split, the frontends never have to.
   * Valid credentials don't mint tokens anymore: they email a 6-digit code
   * and return a challenge for /auth/2fa/verify.
   */
  async login(dto: LoginDto, ip?: string): Promise<TwoFactorChallenge> {
    const { user, roles } = await this.authenticate(dto);
    if (roles.includes('SUPER_ADMIN')) {
      this.logger.warn(
        `School app login denied for platform admin account: ${dto.email} ip=${ip ?? 'unknown'}`,
      );
      throw new ForbiddenException(
        'Platform administrators must sign in through the admin console',
      );
    }
    return this.issueTwoFactorChallenge(user, 'school', ip);
  }

  /** Shared credential flow for both logins: verify, lock out, book-keep. */
  private async authenticate(
    dto: LoginDto,
  ): Promise<{ user: User & { tenant: Tenant | null }; roles: string[] }> {
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

    // Correct password clears the brute-force counter, but the login isn't
    // complete until the emailed code is verified — bookkeeping of
    // lastLoginAt/Ip happens there.
    void this.prisma.user
      .update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      })
      .catch((error) =>
        this.logger.error(
          `Failed to reset lockout counter for ${user.email}`,
          error instanceof Error ? error.stack : String(error),
        ),
      );

    const { roles } = await this.rbacService.getAccess(user.id);
    return { user, roles };
  }

  /**
   * Dedicated platform-console login, step 1: same credential flow, but the
   * backend itself refuses non-SUPER_ADMIN accounts — the frontend never has
   * to. Ends with an emailed 2FA code, like the school login.
   */
  async adminLogin(dto: LoginDto, ip?: string): Promise<TwoFactorChallenge> {
    const { user, roles } = await this.authenticate(dto);
    if (!roles.includes('SUPER_ADMIN')) {
      this.logger.warn(
        `Admin console login denied for non-admin account: ${dto.email} ip=${ip ?? 'unknown'}`,
      );
      throw new ForbiddenException(
        'This console is restricted to platform administrators',
      );
    }
    return this.issueTwoFactorChallenge(user, 'admin', ip);
  }

  /**
   * Step 1 → 2 bridge: persist a hashed 6-digit code, email it, and hand the
   * client a challenge token that /auth/2fa/verify will accept together with
   * the code. Signed with a derived secret so it can never pass for an
   * access or refresh token.
   */
  private async issueTwoFactorChallenge(
    user: User,
    portal: TwoFactorPortal,
    ip?: string,
  ): Promise<TwoFactorChallenge> {
    // Only the newest code is live — a resend or fresh login invalidates
    // earlier ones.
    await this.prisma.loginTwoFactorCode.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.loginTwoFactorCode.create({
      data: {
        userId: user.id,
        codeHash: sha256(code),
        expiresAt: new Date(Date.now() + TWO_FACTOR_CODE_TTL_MS),
      },
    });

    // Fire-and-forget: MailService logs the code in dev and swallows
    // delivery errors; the user can always hit resend.
    void this.mailService.sendLoginCodeEmail(
      user.email,
      code,
      TWO_FACTOR_CODE_TTL_MINUTES,
    );

    const payload: TwoFactorTokenPayload = {
      sub: user.id,
      email: user.email,
      portal,
      purpose: '2fa',
    };
    const challengeToken = await this.jwtService.signAsync(payload, {
      secret: this.twoFactorSecret(),
      expiresIn: TWO_FACTOR_CHALLENGE_TTL,
    });

    this.logger.log(
      `2FA code issued for ${user.email} portal=${portal} ip=${ip ?? 'unknown'}`,
    );

    return {
      twoFactorRequired: true,
      challengeToken,
      email: maskEmail(user.email),
      expiresInMinutes: TWO_FACTOR_CODE_TTL_MINUTES,
    };
  }

  /**
   * Step 2: exchange challenge token + emailed code for real tokens. Re-runs
   * the account/tenant/role gates — the account may have changed between the
   * password check and now.
   */
  async verifyTwoFactor(
    challengeToken: string,
    code: string,
    ip?: string,
  ): Promise<AuthResponse> {
    const payload = await this.readTwoFactorToken(challengeToken);

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      include: { tenant: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired sign-in session');
    }
    if (
      user.tenant &&
      (user.tenant.deletedAt ||
        user.tenant.status === TenantStatus.SUSPENDED ||
        user.tenant.status === TenantStatus.CANCELLED)
    ) {
      throw new UnauthorizedException('Tenant account is not active');
    }

    const record = await this.prisma.loginTwoFactorCode.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'The code has expired. Request a new one.',
      );
    }
    if (record.attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
      throw new UnauthorizedException(
        'Too many incorrect codes. Sign in again to get a new code.',
      );
    }
    if (record.codeHash !== sha256(code)) {
      await this.prisma.loginTwoFactorCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Incorrect code');
    }

    await this.prisma.loginTwoFactorCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    // Same console split as step 1 — a challenge from one door can't open
    // the other, even if roles changed in between.
    const { roles } = await this.rbacService.getAccess(user.id);
    if (payload.portal === 'admin' && !roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException(
        'This console is restricted to platform administrators',
      );
    }
    if (payload.portal === 'school' && roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException(
        'Platform administrators must sign in through the admin console',
      );
    }

    // Bookkeeping — doesn't gate the login, so don't make the user wait on it
    void this.prisma.user
      .update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), lastLoginIp: ip ?? null },
      })
      .catch((error) =>
        this.logger.error(
          `Failed to record login bookkeeping for ${user.email}`,
          error instanceof Error ? error.stack : String(error),
        ),
      );

    this.logger.log(
      `User logged in (2FA): ${user.email}${user.tenant ? ` (${user.tenant.subdomain})` : ' (platform)'} ip=${ip ?? 'unknown'}`,
    );

    return this.buildAuthResponse(user, user.tenant);
  }

  /** Re-send the login code for a live challenge; the old code stops working. */
  async resendTwoFactor(challengeToken: string): Promise<{ sent: true }> {
    const payload = await this.readTwoFactorToken(challengeToken);

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid or expired sign-in session');
    }

    await this.issueTwoFactorChallenge(user, payload.portal);
    return { sent: true };
  }

  private async readTwoFactorToken(
    token: string,
  ): Promise<TwoFactorTokenPayload> {
    let payload: TwoFactorTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<TwoFactorTokenPayload>(
        token,
        { secret: this.twoFactorSecret() },
      );
    } catch {
      throw new UnauthorizedException(
        'Your sign-in session has expired. Please sign in again.',
      );
    }
    if (payload.purpose !== '2fa') {
      throw new UnauthorizedException('Invalid sign-in session');
    }
    return payload;
  }

  // Derived, not shared: a challenge token must never verify as an access
  // token (JwtAuthGuard) or refresh token, and vice versa.
  private twoFactorSecret(): string {
    return `${this.configService.getOrThrow<string>('jwt.secret')}.2fa`;
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
