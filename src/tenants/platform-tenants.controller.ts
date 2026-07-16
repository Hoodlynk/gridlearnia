import {
  Body,
  Controller,
  Delete,
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
import { PlatformUpdateTenantDto } from './dto/platform-update-tenant.dto';
import { TenantsService } from './tenants.service';

/** Platform staff only. */
@ApiTags('platform')
@ApiBearerAuth()
@RequireSuperAdmin()
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @ApiOperation({ summary: 'List every school with its user count (SUPER_ADMIN)' })
  findAll() {
    return this.tenantsService.listForPlatform();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a school: tier, status, user cap (SUPER_ADMIN)' })
  update(
    @CurrentUser() actor: SafeUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlatformUpdateTenantDto,
    @Ip() ip: string,
  ) {
    return this.tenantsService.updateForPlatform(id, dto, actor.id, ip);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a school (SUPER_ADMIN)' })
  remove(
    @CurrentUser() actor: SafeUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ) {
    return this.tenantsService.deleteForPlatform(id, actor.id, ip);
  }
}
