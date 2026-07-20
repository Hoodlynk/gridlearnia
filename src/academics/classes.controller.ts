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
import { CreateClassDto, UpdateClassDto } from './dto/class.dto';
import { ClassesService } from './classes.service';

@ApiTags('academics')
@ApiBearerAuth()
@RequireTenant()
@Controller('academics/classes')
export class ClassesController {
  constructor(private readonly service: ClassesService) {}

  @Get()
  @RequirePermissions('school-settings:view')
  @ApiQuery({ name: 'academicYearId', required: true })
  @ApiQuery({ name: 'gradeId', required: false })
  @ApiOperation({ summary: 'List classes for a year (optionally by grade)' })
  list(
    @CurrentTenant() tenant: Tenant,
    @Query('academicYearId', ParseUUIDPipe) academicYearId: string,
    @Query('gradeId') gradeId?: string,
  ) {
    return this.service.list(tenant.id, academicYearId, gradeId);
  }

  @Post()
  @RequirePermissions('school-settings:create')
  @ApiOperation({ summary: 'Create a class (stream) in a grade for a year' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateClassDto) {
    return this.service.create(tenant.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('school-settings:update')
  @ApiOperation({ summary: 'Rename a class' })
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.service.update(tenant.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('school-settings:delete')
  @ApiOperation({ summary: 'Delete a class' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenant.id, id);
  }
}
