import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest, SafeUser } from '../types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SafeUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
