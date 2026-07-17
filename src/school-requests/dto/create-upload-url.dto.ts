import { ApiProperty } from '@nestjs/swagger';
import { SchoolRequestDocumentType } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsString, Length, Max, Min } from 'class-validator';
import { DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES } from './school-request-document.dto';

export class CreateUploadUrlDto {
  @ApiProperty({ enum: SchoolRequestDocumentType })
  @IsEnum(SchoolRequestDocumentType)
  type: SchoolRequestDocumentType;

  @ApiProperty({ example: 'national-id.pdf' })
  @IsString()
  @Length(1, 200)
  fileName: string;

  @ApiProperty({ enum: DOCUMENT_MIME_TYPES })
  @IsIn(DOCUMENT_MIME_TYPES, {
    message: 'Only PDF, JPEG, PNG, or WebP files are accepted',
  })
  mimeType: string;

  @ApiProperty({ maximum: DOCUMENT_MAX_BYTES })
  @IsInt()
  @Min(1)
  @Max(DOCUMENT_MAX_BYTES, { message: 'File must be 10 MB or smaller' })
  sizeBytes: number;
}
