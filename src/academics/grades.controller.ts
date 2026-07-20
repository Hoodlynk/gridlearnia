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
import { CreateGradeDto, UpdateGradeDto } from './dto/grade.dto';
import { GradesService } from './grades.service';

@ApiTags('academics')
@ApiBearerAuth()
@RequireTenant()
@Controller('academics/grades')
export class GradesController {
  constructor(private readonly service: GradesService) {}

  @Get()
  @RequirePermissions('school-settings:view')
  @ApiQuery({ name: 'sectionId', required: true })
  @ApiOperation({ summary: 'List grades within a section' })
  list(
    @CurrentTenant() tenant: Tenant,
    @Query('sectionId', ParseUUIDPipe) sectionId: string,
  ) {
    return this.service.list(tenant.id, sectionId);
  }

  @Post()
  @RequirePermissions('school-settings:create')
  @ApiOperation({ summary: 'Create a grade in a section' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateGradeDto) {
    return this.service.create(tenant.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('school-settings:update')
  @ApiOperation({ summary: 'Update a grade (name/order)' })
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGradeDto,
  ) {
    return this.service.update(tenant.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('school-settings:delete')
  @ApiOperation({ summary: 'Delete a grade (must have no classes)' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenant.id, id);
  }
}
