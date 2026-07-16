import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  @RequirePermissions('school-settings:view')
  @ApiOperation({ summary: 'Get the current school with usage overview' })
  getCurrent(@CurrentTenant() tenant: Tenant) {
    return this.tenantsService.getOverview(tenant);
  }

  @Patch('me')
  @RequirePermissions('school-settings:update')
  @ApiOperation({ summary: 'Update school name/settings (Director)' })
  update(@CurrentTenant() tenant: Tenant, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(tenant.id, dto);
  }
}
