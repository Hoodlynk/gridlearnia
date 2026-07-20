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
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Tenant } from '@prisma/client';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { RequireTenant } from '../common/decorators/require-tenant.decorator';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import {
  CloneGradingSchemeDto,
  CreateGradingSchemeDto,
  ReplaceBandsDto,
  UpdateGradingSchemeDto,
} from './dto/grading-scheme.dto';
import { GradingSchemesService } from './grading-schemes.service';

/** Manage a school's own grading schemes. Listing (system + own) lives in the
 *  catalog controller; everything here writes tenant-owned rows only. */
@ApiTags('academics')
@ApiBearerAuth()
@RequireTenant()
@Controller('academics/grading-schemes')
export class GradingSchemesController {
  constructor(private readonly service: GradingSchemesService) {}

  @Post('clone')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('school-settings:create')
  @ApiOperation({ summary: 'Adopt a template into an editable copy for this school' })
  clone(@CurrentTenant() tenant: Tenant, @Body() dto: CloneGradingSchemeDto) {
    return this.service.clone(tenant.id, dto.sourceGradingSchemeId);
  }

  @Post()
  @RequirePermissions('school-settings:create')
  @ApiOperation({ summary: 'Create a grading scheme from scratch' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateGradingSchemeDto) {
    return this.service.create(tenant.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('school-settings:update')
  @ApiOperation({ summary: 'Update an own grading scheme (name)' })
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGradingSchemeDto,
  ) {
    return this.service.update(tenant.id, id, dto);
  }

  @Put(':id/bands')
  @RequirePermissions('school-settings:update')
  @ApiOperation({ summary: 'Replace the band list for an own grading scheme' })
  replaceBands(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceBandsDto,
  ) {
    return this.service.replaceBands(tenant.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('school-settings:delete')
  @ApiOperation({ summary: 'Delete an own grading scheme (must be unassigned)' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenant.id, id);
  }
}
