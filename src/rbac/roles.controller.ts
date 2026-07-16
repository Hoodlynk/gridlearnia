import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { RbacService } from './rbac.service';

@ApiTags('rbac')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rbacService: RbacService) {}

  @Get()
  @RequirePermissions('user-management:view')
  @ApiOperation({ summary: 'List roles available to this school' })
  listRoles(@CurrentTenant() tenant: Tenant) {
    return this.rbacService.listRoles(tenant.id);
  }

  @Get('permissions')
  @RequirePermissions('user-management:view')
  @ApiOperation({ summary: 'Platform permission catalog, grouped by module' })
  listPermissionCatalog() {
    return this.rbacService.listPermissionCatalog();
  }
}
