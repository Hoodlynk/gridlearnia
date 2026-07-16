import { Tenant, User } from '@prisma/client';
import { FastifyRequest } from 'fastify';

export interface JwtPayload {
  sub: string; // user id
  tenantId: string;
  email: string;
}

export type SafeUser = Omit<User, 'passwordHash'>;

export interface AuthenticatedRequest extends FastifyRequest {
  user: SafeUser;
  tenant: Tenant;
}
