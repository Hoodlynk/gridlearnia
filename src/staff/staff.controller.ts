import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireTenant } from '../common/decorators/require-tenant.decorator';
import { SafeUser } from '../common/types';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import {
  CreateStaffDto,
  InviteStaffDto,
  LinkStaffUserDto,
  UpdateStaffDto,
} from './dto/staff.dto';
import { StaffService } from './staff.service';

@ApiTags('staff')
@ApiBearerAuth()
@RequireTenant()
@Controller('staff/members')
export class StaffController {
  constructor(private readonly service: StaffService) {}

  @Get()
  @RequirePermissions('staff-management:view')
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiOperation({ summary: 'List staff (searchable, filterable)' })
  list(
    @CurrentTenant() tenant: Tenant,
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.list(tenant.id, { search, departmentId, status });
  }

  @Get(':id')
  @RequirePermissions('staff-management:view')
  @ApiOperation({ summary: 'Get a staff member' })
  get(@CurrentTenant() tenant: Tenant, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(tenant.id, id);
  }

  @Post()
  @RequirePermissions('staff-management:create')
  @ApiOperation({ summary: 'Add a staff member' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateStaffDto) {
    return this.service.create(tenant.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('staff-management:update')
  @ApiOperation({ summary: 'Update a staff member' })
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.service.update(tenant.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('staff-management:delete')
  @ApiOperation({ summary: 'Delete a staff member (must hold no responsibilities)' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenant.id, id);
  }

  // ── Portal access ─────────────────────────────────────────────────────────
  // Issuing a login invitation is a user-management action, so both permissions
  // are required (the guard ANDs them).

  @Post(':id/invite')
  @RequirePermissions('staff-management:update', 'user-management:manage')
  @ApiOperation({
    summary: 'Invite a staff member to the portal (links their account on accept)',
  })
  invite(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: SafeUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteStaffDto,
  ) {
    return this.service.invite(tenant.id, user.id, id, dto);
  }

  @Put(':id/user')
  @RequirePermissions('staff-management:update', 'user-management:manage')
  @ApiOperation({ summary: 'Link (or unlink) an existing school user to a staff profile' })
  linkUser(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkStaffUserDto,
  ) {
    return this.service.linkUser(tenant.id, id, dto.userId ?? null);
  }
}
