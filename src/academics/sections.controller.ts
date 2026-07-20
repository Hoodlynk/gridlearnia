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
import { CreateSectionDto, UpdateSectionDto } from './dto/section.dto';
import { SectionsService } from './sections.service';

@ApiTags('academics')
@ApiBearerAuth()
@RequireTenant()
@Controller('academics/sections')
export class SectionsController {
  constructor(private readonly service: SectionsService) {}

  @Get()
  @RequirePermissions('school-settings:view')
  @ApiQuery({ name: 'campusId', required: false })
  @ApiOperation({ summary: 'List sections (optionally by campus)' })
  list(
    @CurrentTenant() tenant: Tenant,
    @Query('campusId') campusId?: string,
  ) {
    return this.service.list(tenant.id, campusId);
  }

  @Post()
  @RequirePermissions('school-settings:create')
  @ApiOperation({ summary: 'Create a section' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateSectionDto) {
    return this.service.create(tenant.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('school-settings:update')
  @ApiOperation({ summary: 'Update a section (name/order/curriculum/grading)' })
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.service.update(tenant.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('school-settings:delete')
  @ApiOperation({ summary: 'Delete a section (must have no grades)' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenant.id, id);
  }
}
