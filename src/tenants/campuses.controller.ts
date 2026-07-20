import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { RequireTenant } from '../common/decorators/require-tenant.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CampusesService } from './campuses.service';

/** Tenant-facing: a school reading its own campuses (e.g. to populate the
 *  section-assignment picker). Platform-wide campus management lives in the
 *  command console (PlatformCampusesController). */
@ApiTags('campuses')
@ApiBearerAuth()
@RequireTenant()
@Controller('campuses')
export class CampusesController {
  constructor(private readonly campusesService: CampusesService) {}

  @Get()
  @RequirePermissions('school-settings:view')
  @ApiOperation({ summary: "List the current school's campuses" })
  list(@CurrentTenant() tenant: Tenant) {
    return this.campusesService.list(tenant.id);
  }
}
