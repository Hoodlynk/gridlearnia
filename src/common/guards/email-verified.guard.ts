import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_VERIFIED_EMAIL_KEY } from '../decorators/require-verified-email.decorator';
import { AuthenticatedRequest } from '../types';

/**
 * Enforces @RequireVerifiedEmail(). Runs after JwtAuthGuard, which has
 * already loaded the user — no extra query. Login itself stays open for
 * unverified accounts; only decorated routes (onboarding actions) are gated.
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_VERIFIED_EMAIL_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user?.emailVerified) {
      throw new ForbiddenException(
        'Verify your email address to continue — check your inbox for the link',
      );
    }
    return true;
  }
}
