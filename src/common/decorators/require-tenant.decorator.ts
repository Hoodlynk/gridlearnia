import { SetMetadata } from '@nestjs/common';

export const REQUIRE_TENANT_KEY = 'requireTenant';

/**
 * Marks routes (or whole controllers) as requiring school membership —
 * platform-level users (tenantId = null) get a 403.
 * Use @RequireTenant(false) on a handler to opt out of a class-level marker.
 */
export const RequireTenant = (required = true) =>
  SetMetadata(REQUIRE_TENANT_KEY, required);
