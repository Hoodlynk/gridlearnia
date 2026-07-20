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
import { CreateGuardianDto, UpdateGuardianDto } from './dto/guardian.dto';
import { GuardiansService } from './guardians.service';

@ApiTags('sis')
@ApiBearerAuth()
@RequireTenant()
@Controller('sis/guardians')
export class GuardiansController {
  constructor(private readonly service: GuardiansService) {}

  @Get()
  @RequirePermissions('student-records:view')
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({ summary: 'List guardians (searchable)' })
  list(@CurrentTenant() tenant: Tenant, @Query('search') search?: string) {
    return this.service.list(tenant.id, search);
  }

  @Post()
  @RequirePermissions('student-records:create')
  @ApiOperation({ summary: 'Create a guardian' })
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateGuardianDto) {
    return this.service.create(tenant.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('student-records:update')
  @ApiOperation({ summary: 'Update a guardian' })
  update(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGuardianDto,
  ) {
    return this.service.update(tenant.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('student-records:delete')
  @ApiOperation({ summary: 'Delete a guardian (must not be linked to students)' })
  remove(
    @CurrentTenant() tenant: Tenant,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(tenant.id, id);
  }
}
