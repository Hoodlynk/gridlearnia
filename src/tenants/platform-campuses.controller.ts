import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SafeUser } from '../common/types';
import { RequireSuperAdmin } from '../rbac/decorators/require-super-admin.decorator';
import { CampusesService } from './campuses.service';
import { CreateCampusDto } from './dto/create-campus.dto';
import { UpdateCampusDto } from './dto/update-campus.dto';

/** Platform staff only — manage any school's physical campuses. */
@ApiTags('platform')
@ApiBearerAuth()
@RequireSuperAdmin()
@Controller('platform/tenants/:tenantId/campuses')
export class PlatformCampusesController {
  constructor(private readonly campusesService: CampusesService) {}

  @Get()
  @ApiOperation({ summary: "List a school's campuses (SUPER_ADMIN)" })
  list(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.campusesService.list(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a campus to a school (SUPER_ADMIN)' })
  create(
    @CurrentUser() actor: SafeUser,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateCampusDto,
    @Ip() ip: string,
  ) {
    return this.campusesService.create(tenantId, dto, actor.id, ip);
  }

  @Patch(':campusId')
  @ApiOperation({ summary: 'Update a campus / promote main (SUPER_ADMIN)' })
  update(
    @CurrentUser() actor: SafeUser,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('campusId', ParseUUIDPipe) campusId: string,
    @Body() dto: UpdateCampusDto,
    @Ip() ip: string,
  ) {
    return this.campusesService.update(tenantId, campusId, dto, actor.id, ip);
  }

  @Delete(':campusId')
  @ApiOperation({ summary: 'Soft-delete a campus (SUPER_ADMIN)' })
  remove(
    @CurrentUser() actor: SafeUser,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('campusId', ParseUUIDPipe) campusId: string,
    @Ip() ip: string,
  ) {
    return this.campusesService.remove(tenantId, campusId, actor.id, ip);
  }
}
