import { Body, Controller, Get, Ip, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SafeUser } from '../common/types';
import { RequireSuperAdmin } from './decorators/require-super-admin.decorator';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RbacService } from './rbac.service';

/** Platform staff only. */
@ApiTags('platform')
@ApiBearerAuth()
@RequireSuperAdmin()
@Controller('platform/roles')
export class PlatformRolesController {
  constructor(private readonly rbacService: RbacService) {}

  @Get()
  @ApiOperation({
    summary: 'System roles with permissions and assignment counts (SUPER_ADMIN)',
  })
  findAll() {
    return this.rbacService.listSystemRoles();
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Permission catalog grouped by module (SUPER_ADMIN)' })
  catalog() {
    return this.rbacService.listPermissionCatalog();
  }

  @Patch(':key')
  @ApiOperation({
    summary: "Replace a system role's permission set platform-wide (SUPER_ADMIN)",
  })
  updatePermissions(
    @CurrentUser() actor: SafeUser,
    @Param('key') key: string,
    @Body() dto: UpdateRolePermissionsDto,
    @Ip() ip: string,
  ) {
    return this.rbacService.updateSystemRolePermissions(
      key,
      dto.permissions,
      actor.id,
      ip,
    );
  }
}
