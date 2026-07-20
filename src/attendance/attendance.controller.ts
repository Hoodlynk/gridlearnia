import {
  Body,
  Controller,
  Get,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { RequireTenant } from '../common/decorators/require-tenant.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto } from './dto/attendance.dto';

@ApiTags('attendance')
@ApiBearerAuth()
@RequireTenant()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get()
  @RequirePermissions('attendance:view')
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'date', required: true, description: 'ISO date' })
  @ApiOperation({ summary: 'The register for a class on a date' })
  roster(
    @CurrentTenant() tenant: Tenant,
    @Query('classId', ParseUUIDPipe) classId: string,
    @Query('date') date: string,
  ) {
    return this.service.roster(tenant.id, classId, date);
  }

  @Put()
  @RequirePermissions('attendance:update')
  @ApiOperation({ summary: 'Mark/replace the register for a class on a date' })
  mark(@CurrentTenant() tenant: Tenant, @Body() dto: MarkAttendanceDto) {
    return this.service.mark(tenant.id, dto);
  }

  @Get('summary')
  @RequirePermissions('attendance:view')
  @ApiQuery({ name: 'classId', required: true })
  @ApiQuery({ name: 'from', required: true, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: true, description: 'ISO date' })
  @ApiOperation({ summary: 'Per-student attendance counts over a date range' })
  summary(
    @CurrentTenant() tenant: Tenant,
    @Query('classId', ParseUUIDPipe) classId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.summary(tenant.id, classId, from, to);
  }
}
