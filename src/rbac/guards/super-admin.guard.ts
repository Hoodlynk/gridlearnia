import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../../common/types';
import { REQUIRE_SUPER_ADMIN_KEY } from '../decorators/require-super-admin.decorator';
import { ROLE_KEYS } from '../rbac.constants';
import { RbacService } from '../rbac.service';

/** Global guard: enforces @RequireSuperAdmin() metadata. Runs after JwtAuthGuard. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_SUPER_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      throw new ForbiddenException('Platform administrator access required');
    }

    const access = await this.rbacService.getAccess(user.id);
    if (!access.roles.includes(ROLE_KEYS.SUPER_ADMIN)) {
      throw new ForbiddenException('Platform administrator access required');
    }

    return true;
  }
}
