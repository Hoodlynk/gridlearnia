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
  CreateEnrollmentDto,
  UpdateEnrollmentDto,
} from './dto/enrollment.dto';
import { EnrollmentsService } from './enrollments.service';

// Enrollment is the act of admitting a student into a class, so it gates under
// the `admissions` module rather than `student-records`.
@ApiTags('sis')
@ApiBearerAuth()
@RequireTenant()
@Controller('sis/enrollments')
export class EnrollmentsController {
  constructor(private readonly service: EnrollmentsService) {}

  @Get()
  @RequirePermissions('admissions:view')
  @ApiQuery({ name: 'academicYearId', required: false })
  @ApiQuery({ name: 'classId', required: false })
  @ApiQuery({ name: 'studentId', required: false })
  @ApiOperation({ summary: 'List enrollments (filter by year, class, or student)' })
  list(
    @CurrentTenant() tenant: Tenant,
    @Query('academicYearId') academicYearId?: string,
    @Query('classId') classId?: string,
    @Query('studentId') studentId?: string,
  ) {
    return this.service.list(tenant.id, { academicYearId, classId, studentId });
  }

  @Post()
  @RequirePermissions('admissions:create')
  @ApiOperation({ summary: 'Enroll a student into a class' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateEnrollmentDto) {
    return this.service.create(tenant.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('admissions:update')
  @ApiOperation({ summary: 'Update an enrollment (transfer class, roll no., status)' })
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEnrollmentDto,
  ) {
    return this.service.update(tenant.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('admissions:delete')
  @ApiOperation({ summary: 'Delete an enrollment' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenant.id, id);
  }
}
