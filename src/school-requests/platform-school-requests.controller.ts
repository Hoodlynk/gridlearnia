import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SchoolRequestStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SafeUser } from '../common/types';
import { RequireSuperAdmin } from '../rbac/decorators/require-super-admin.decorator';
import { RejectSchoolRequestDto } from './dto/reject-school-request.dto';
import { RequestChangesDto } from './dto/request-changes.dto';
import { SchoolRequestsService } from './school-requests.service';

/** Platform staff only. */
@ApiTags('platform')
@ApiBearerAuth()
@RequireSuperAdmin()
@Controller('platform/school-requests')
export class PlatformSchoolRequestsController {
  constructor(private readonly schoolRequestsService: SchoolRequestsService) {}

  @Get()
  @ApiQuery({ name: 'status', enum: SchoolRequestStatus, required: false })
  @ApiOperation({ summary: 'List school requests (SUPER_ADMIN)' })
  findAll(@Query('status') status?: SchoolRequestStatus) {
    return this.schoolRequestsService.findAll(status);
  }

  @Get('stats')
  @ApiOperation({ summary: 'School request counts by status (SUPER_ADMIN)' })
  stats() {
    return this.schoolRequestsService.stats();
  }

  @Get(':id/documents/:documentId/download')
  @ApiOperation({
    summary: 'Signed download URL for a KYC document (SUPER_ADMIN, short-lived)',
  })
  documentDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.schoolRequestsService.documentDownloadUrl(id, documentId);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary:
      'Approve: creates the school and binds the requester as its ORGANIZATION_ADMIN',
  })
  approve(
    @CurrentUser() reviewer: SafeUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schoolRequestsService.approve(id, reviewer.id);
  }

  @Post(':id/request-changes')
  @ApiOperation({
    summary:
      'Send a request back for corrections with reviewer comments (applicant can edit and resubmit)',
  })
  requestChanges(
    @CurrentUser() reviewer: SafeUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestChangesDto,
  ) {
    return this.schoolRequestsService.requestChanges(
      id,
      reviewer.id,
      dto.comments,
    );
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a school request' })
  reject(
    @CurrentUser() reviewer: SafeUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectSchoolRequestDto,
  ) {
    return this.schoolRequestsService.reject(id, reviewer.id, dto.reason);
  }
}
