import {
  Body,
  Controller,
  Delete,
  Get,
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
import { AcademicYearsService } from './academic-years.service';
import {
  CreateAcademicYearDto,
  ReplaceTermsDto,
  UpdateAcademicYearDto,
} from './dto/academic-year.dto';

@ApiTags('academics')
@ApiBearerAuth()
@RequireTenant()
@Controller('academics/years')
export class AcademicYearsController {
  constructor(private readonly service: AcademicYearsService) {}

  @Get()
  @RequirePermissions('school-settings:view')
  @ApiOperation({ summary: 'List academic years with their terms' })
  list(@CurrentTenant() tenant: Tenant) {
    return this.service.list(tenant.id);
  }

  @Post()
  @RequirePermissions('school-settings:create')
  @ApiOperation({ summary: 'Create an academic year (optionally with terms)' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateAcademicYearDto) {
    return this.service.create(tenant.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('school-settings:update')
  @ApiOperation({ summary: 'Update an academic year (name/dates)' })
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    return this.service.update(tenant.id, id, dto);
  }

  @Put(':id/terms')
  @RequirePermissions('school-settings:update')
  @ApiOperation({ summary: 'Replace the term list for a year' })
  replaceTerms(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceTermsDto,
  ) {
    return this.service.replaceTerms(tenant.id, id, dto);
  }

  @Post(':id/set-current')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('school-settings:update')
  @ApiOperation({ summary: 'Mark a year as the current one' })
  setCurrent(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.setCurrent(tenant.id, id);
  }

  @Delete(':id')
  @RequirePermissions('school-settings:delete')
  @ApiOperation({ summary: 'Delete an academic year (must have no classes)' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenant.id, id);
  }
}
