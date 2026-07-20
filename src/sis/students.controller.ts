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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { RequireTenant } from '../common/decorators/require-tenant.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import {
  CreateAndLinkGuardianDto,
  LinkGuardianDto,
} from './dto/guardian.dto';
import { CreateStudentDto, UpdateStudentDto } from './dto/student.dto';
import { StudentsService } from './students.service';

@ApiTags('sis')
@ApiBearerAuth()
@RequireTenant()
@Controller('sis/students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  @RequirePermissions('student-records:view')
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'campusId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiOperation({ summary: 'List students (searchable, filterable)' })
  list(
    @CurrentTenant() tenant: Tenant,
    @Query('search') search?: string,
    @Query('campusId') campusId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.list(tenant.id, { search, campusId, status });
  }

  @Get(':id')
  @RequirePermissions('student-records:view')
  @ApiOperation({ summary: 'Get a student with guardians and current enrollment' })
  get(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(tenant.id, id);
  }

  @Post()
  @RequirePermissions('student-records:create')
  @ApiOperation({ summary: 'Admit a student' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateStudentDto) {
    return this.service.create(tenant.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('student-records:update')
  @ApiOperation({ summary: 'Update a student' })
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.service.update(tenant.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('student-records:delete')
  @ApiOperation({ summary: 'Delete a student (must not be actively enrolled)' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenant.id, id);
  }

  // ----- guardian links -----

  @Post(':id/guardians')
  @RequirePermissions('student-records:update')
  @ApiOperation({ summary: 'Link an existing guardian to the student' })
  linkGuardian(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkGuardianDto,
  ) {
    return this.service.linkGuardian(tenant.id, id, dto);
  }

  @Post(':id/guardians/new')
  @RequirePermissions('student-records:update')
  @ApiOperation({ summary: 'Create a guardian and link it to the student' })
  createAndLinkGuardian(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAndLinkGuardianDto,
  ) {
    return this.service.createAndLinkGuardian(tenant.id, id, dto);
  }

  @Delete(':id/guardians/:guardianId')
  @RequirePermissions('student-records:update')
  @ApiOperation({ summary: 'Unlink a guardian from the student' })
  unlinkGuardian(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
  ) {
    return this.service.unlinkGuardian(tenant.id, id, guardianId);
  }
}
