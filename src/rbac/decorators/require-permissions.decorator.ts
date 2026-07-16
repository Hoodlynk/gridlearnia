import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../rbac.constants';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Requires ALL listed permissions, e.g. @RequirePermissions('exams:update').
 * `module:manage` on the user satisfies any action on that module.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
