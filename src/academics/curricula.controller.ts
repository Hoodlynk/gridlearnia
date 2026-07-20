import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
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
import { CurriculaService } from './curricula.service';
import {
  CloneCurriculumDto,
  CreateCurriculumDto,
  CreateSubjectDto,
  UpdateCurriculumDto,
  UpdateSubjectDto,
} from './dto/curriculum.dto';

/** Manage a school's own curricula. Listing (system + own) lives in the
 *  catalog controller; everything here writes tenant-owned rows only. */
@ApiTags('academics')
@ApiBearerAuth()
@RequireTenant()
@Controller('academics/curricula')
export class CurriculaController {
  constructor(private readonly service: CurriculaService) {}

  @Post('clone')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('school-settings:create')
  @ApiOperation({ summary: 'Adopt a template into an editable copy for this school' })
  clone(@CurrentTenant() tenant: Tenant, @Body() dto: CloneCurriculumDto) {
    return this.service.clone(tenant.id, dto.sourceCurriculumId);
  }

  @Post()
  @RequirePermissions('school-settings:create')
  @ApiOperation({ summary: 'Create a curriculum from scratch' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateCurriculumDto) {
    return this.service.create(tenant.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('school-settings:update')
  @ApiOperation({ summary: 'Update an own curriculum (name/country)' })
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCurriculumDto,
  ) {
    return this.service.update(tenant.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('school-settings:delete')
  @ApiOperation({ summary: 'Delete an own curriculum (must be unassigned)' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenant.id, id);
  }

  @Post(':id/subjects')
  @RequirePermissions('school-settings:update')
  @ApiOperation({ summary: 'Add a subject to an own curriculum' })
  addSubject(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSubjectDto,
  ) {
    return this.service.addSubject(tenant.id, id, dto);
  }

  @Patch(':id/subjects/:subjectId')
  @RequirePermissions('school-settings:update')
  @ApiOperation({ summary: 'Update a subject' })
  updateSubject(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.service.updateSubject(tenant.id, id, subjectId, dto);
  }

  @Delete(':id/subjects/:subjectId')
  @RequirePermissions('school-settings:update')
  @ApiOperation({ summary: 'Remove a subject' })
  removeSubject(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
  ) {
    return this.service.removeSubject(tenant.id, id, subjectId);
  }
}
