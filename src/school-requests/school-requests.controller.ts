import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SchoolRequestDocumentType } from '@prisma/client';
import { FastifyRequest } from 'fastify';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireVerifiedEmail } from '../common/decorators/require-verified-email.decorator';
import { SafeUser } from '../common/types';
import { perMinute, RateLimit } from '../rate-limit/decorators/rate-limit.decorator';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { CreateSchoolRequestDto } from './dto/create-school-request.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { DOCUMENT_MIME_TYPES } from './dto/school-request-document.dto';
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

  @Put('draft')
  @RequireVerifiedEmail()
  @RateLimit(perMinute(20))
  @ApiOperation({
    summary:
      'Save or update my draft application (documents optional; not yet reviewed)',
  })
  saveDraft(@CurrentUser() user: SafeUser, @Body() dto: SaveDraftDto) {
    return this.schoolRequestsService.saveDraft(user.id, dto);
  }

  @Post('draft/submit')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit my draft application for review' })
  submitDraft(@CurrentUser() user: SafeUser) {
    return this.schoolRequestsService.submitDraft(user.id);
  }

  @Post('uploads')
  @RequireVerifiedEmail()
  @RateLimit(perMinute(20))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload a KYC document (ID scan / school certificate) — multipart: "file" + "type" field',
  })
  async uploadDocument(
    @CurrentUser() user: SafeUser,
    @Req() req: FastifyRequest,
  ) {
    const file = await req.file();
    if (!file) {
      throw new BadRequestException('Attach the document in the "file" field');
    }

    const typeField = file.fields.type;
    const type =
      typeField && !Array.isArray(typeField) && typeField.type === 'field'
        ? String(typeField.value)
        : undefined;
    if (!type || !(type in SchoolRequestDocumentType)) {
      throw new BadRequestException('Invalid document type');
    }

    if (!DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only PDF, JPEG, PNG, or WebP files are accepted',
      );
    }

    // toBuffer() throws when the multipart size limit truncated the stream.
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      throw new BadRequestException('File must be 10 MB or smaller');
    }

    return this.schoolRequestsService.uploadDocument(
      user.id,
      type as SchoolRequestDocumentType,
      { buffer, fileName: file.filename, mimeType: file.mimetype },
    );
  }

  @Get('mine')
  @ApiOperation({ summary: 'List my school requests and their status' })
  findMine(@CurrentUser() user: SafeUser) {
    return this.schoolRequestsService.findMine(user.id);
  }

  @Get('availability')
  @RateLimit(perMinute(20))
  @ApiOperation({
    summary:
      'Check whether a school subdomain and (normalized) name are still available',
  })
  availability(@Query() query: AvailabilityQueryDto) {
    return this.schoolRequestsService.availability(query.subdomain, query.name);
  }
}
