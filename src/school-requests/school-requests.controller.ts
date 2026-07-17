import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../common/decorators/require-verified-email.decorator';
import { SafeUser } from '../common/types';
import { perMinute, RateLimit } from '../rate-limit/decorators/rate-limit.decorator';
import { CreateSchoolRequestDto } from './dto/create-school-request.dto';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { SchoolRequestsService } from './school-requests.service';

/** User-facing: any authenticated platform user (no tenant required). */
@ApiTags('school-requests')
@ApiBearerAuth()
@Controller('school-requests')
export class SchoolRequestsController {
  constructor(private readonly schoolRequestsService: SchoolRequestsService) {}

  @Post()
  @RequireVerifiedEmail()
  @ApiOperation({ summary: 'Apply to create a school (requires no current school)' })
  create(@CurrentUser() user: SafeUser, @Body() dto: CreateSchoolRequestDto) {
    return this.schoolRequestsService.create(user.id, dto);
  }

  @Post('uploads')
  @RequireVerifiedEmail()
  @RateLimit(perMinute(20))
  @ApiOperation({
    summary:
      'Presigned upload URL for a KYC document (ID scan / school certificate)',
  })
  createUploadUrl(
    @CurrentUser() user: SafeUser,
    @Body() dto: CreateUploadUrlDto,
  ) {
    return this.schoolRequestsService.createUploadUrl(user.id, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'List my school requests and their status' })
  findMine(@CurrentUser() user: SafeUser) {
    return this.schoolRequestsService.findMine(user.id);
  }
}
