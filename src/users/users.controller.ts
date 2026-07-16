import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireTenant } from '../common/decorators/require-tenant.decorator';
import { SafeUser } from '../common/types';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { RbacService } from '../rbac/rbac.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@RequireTenant()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
  ) {}

  @Get()
  @RequirePermissions('user-management:view')
  @ApiOperation({ summary: 'List users in the current school' })
  findAll(@CurrentTenant() tenant: Tenant, @Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(tenant.id, query);
  }

  @Get(':id')
  @RequirePermissions('user-management:view')
  @ApiOperation({ summary: 'Get a user by id' })
  findOne(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.findOne(tenant.id, id);
  }

  @Patch(':id')
  @RequirePermissions('user-management:update')
  @ApiOperation({ summary: 'Update a user profile / active status' })
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(tenant.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('user-management:delete')
  @ApiOperation({ summary: 'Soft-delete a user' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.remove(tenant.id, id);
  }

  @Post(':id/roles')
  @RequirePermissions('user-management:manage')
  @ApiOperation({ summary: 'Assign a role to a user (additive, multi-role)' })
  assignRole(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() actor: SafeUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.rbacService.assignRole(tenant.id, actor.id, id, dto.roleKey);
  }

  @Delete(':id/roles/:roleKey')
  @RequirePermissions('user-management:manage')
  @ApiOperation({ summary: 'Remove a role from a user' })
  removeRole(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() actor: SafeUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleKey') roleKey: string,
  ) {
    return this.rbacService.removeRole(tenant.id, actor.id, id, roleKey);
  }
}
