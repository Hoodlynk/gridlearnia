import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SafeUser } from '../common/types';
import { RequireSuperAdmin } from '../rbac/decorators/require-super-admin.decorator';
import { UpdateTenantModuleDto } from './dto/update-tenant-module.dto';
import { TenantModulesService } from './tenant-modules.service';

/** Platform staff only — toggle which modules a school has access to. */
@ApiTags('platform')
@ApiBearerAuth()
@RequireSuperAdmin()
@Controller('platform/tenants/:tenantId/modules')
export class PlatformTenantModulesController {
  constructor(private readonly modulesService: TenantModulesService) {}

  @Get()
  @ApiOperation({ summary: "List a school's module catalogue (SUPER_ADMIN)" })
  list(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.modulesService.list(tenantId);
  }

  @Patch(':moduleKey')
  @ApiOperation({ summary: 'Enable/disable a module for a school (SUPER_ADMIN)' })
  update(
    @CurrentUser() actor: SafeUser,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('moduleKey') moduleKey: string,
    @Body() dto: UpdateTenantModuleDto,
    @Ip() ip: string,
  ) {
    return this.modulesService.update(tenantId, moduleKey, dto, actor.id, ip);
  }
}
