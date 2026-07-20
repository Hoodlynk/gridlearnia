import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { RequireTenant } from '../common/decorators/require-tenant.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { DepartmentsService } from './departments.service';
import {
  AddDepartmentSubjectDto,
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from './dto/department.dto';

@ApiTags('staff')
@ApiBearerAuth()
@RequireTenant()
@Controller('staff/departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  @RequirePermissions('staff-management:view')
  @ApiOperation({ summary: 'List departments (with HOD and subjects)' })
  list(@CurrentTenant() tenant: Tenant) {
    return this.service.list(tenant.id);
  }

  @Post()
  @RequirePermissions('staff-management:create')
  @ApiOperation({ summary: 'Create a department' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateDepartmentDto) {
    return this.service.create(tenant.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('staff-management:update')
  @ApiOperation({ summary: 'Update a department (name/code/HOD)' })
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.service.update(tenant.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('staff-management:delete')
  @ApiOperation({ summary: 'Delete a department (must have no members)' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenant.id, id);
  }

  @Post(':id/subjects')
  @RequirePermissions('staff-management:update')
  @ApiOperation({ summary: 'Attach a subject to the department' })
  addSubject(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddDepartmentSubjectDto,
  ) {
    return this.service.addSubject(tenant.id, id, dto.subjectId);
  }

  @Delete(':id/subjects/:subjectId')
  @RequirePermissions('staff-management:update')
  @ApiOperation({ summary: 'Detach a subject from the department' })
  removeSubject(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
  ) {
    return this.service.removeSubject(tenant.id, id, subjectId);
  }
}
