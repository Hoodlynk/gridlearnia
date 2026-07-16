import { Tenant, User } from '@prisma/client';
import { FastifyRequest } from 'fastify';

export interface JwtPayload {
  sub: string; // user id
  tenantId: string | null;
  email: string;
}

export type SafeUser = Omit<User, 'passwordHash'>;

export interface AuthenticatedRequest extends FastifyRequest {
  user: SafeUser;
  // null for platform-level users who have not joined/created a school yet.
  // Routes marked @RequireTenant() are guaranteed a non-null tenant.
  tenant: Tenant | null;
}
