import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { RequireTenant } from '../common/decorators/require-tenant.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CatalogService } from './catalog.service';

@ApiTags('academics')
@ApiBearerAuth()
@RequireTenant()
@Controller('academics/catalog')
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  @Get('curricula')
  @RequirePermissions('school-settings:view')
  @ApiOperation({ summary: 'List curricula available to this school (with subjects)' })
  curricula(@CurrentTenant() tenant: Tenant) {
    return this.service.listCurricula(tenant.id);
  }

  @Get('grading-schemes')
  @RequirePermissions('school-settings:view')
  @ApiOperation({ summary: 'List grading schemes available to this school (with bands)' })
  gradingSchemes(@CurrentTenant() tenant: Tenant) {
    return this.service.listGradingSchemes(tenant.id);
  }
}
