import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_TENANT_KEY } from '../decorators/require-tenant.decorator';
import { AuthenticatedRequest } from '../types';

/** Global guard: enforces @RequireTenant() metadata. Runs after JwtAuthGuard. */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const { tenant } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!tenant) {
      throw new ForbiddenException(
        'You must belong to a school to perform this action',
      );
    }

    return true;
  }
}
