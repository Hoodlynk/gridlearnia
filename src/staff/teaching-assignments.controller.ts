import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { RequireTenant } from '../common/decorators/require-tenant.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import {
  CreateTeachingAssignmentDto,
  SetClassTeacherDto,
} from './dto/teaching-assignment.dto';
import { TeachingAssignmentsService } from './teaching-assignments.service';

@ApiTags('staff')
@ApiBearerAuth()
@RequireTenant()
@Controller('staff/teaching-assignments')
export class TeachingAssignmentsController {
  constructor(private readonly service: TeachingAssignmentsService) {}

  @Get()
  @RequirePermissions('staff-management:view')
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiQuery({ name: 'academicYearId', required: false })
  @ApiOperation({ summary: 'List teaching assignments (by class, staff or year)' })
  list(
    @CurrentTenant() tenant: Tenant,
    @Query('classId') classId?: string,
    @Query('staffId') staffId?: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.service.list(tenant.id, { classId, staffId, academicYearId });
  }

  @Post()
  @RequirePermissions('staff-management:create')
  @ApiOperation({ summary: 'Assign a teacher to a subject in a class' })
  create(
    @CurrentTenant() tenant: Tenant,
    @Body() dto: CreateTeachingAssignmentDto,
  ) {
    return this.service.create(tenant.id, dto);
  }

  @Delete(':id')
  @RequirePermissions('staff-management:delete')
  @ApiOperation({ summary: 'Remove a teaching assignment' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenant.id, id);
  }

  @Put('class-teacher')
  @RequirePermissions('staff-management:update')
  @ApiOperation({ summary: 'Set (or clear) the class teacher for a class' })
  setClassTeacher(
    @CurrentTenant() tenant: Tenant,
    @Body() dto: SetClassTeacherDto,
  ) {
    return this.service.setClassTeacher(tenant.id, dto);
  }
}
