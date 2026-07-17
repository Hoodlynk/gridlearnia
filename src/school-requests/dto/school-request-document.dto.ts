import { ApiProperty } from '@nestjs/swagger';
import { SchoolRequestDocumentType } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsString, Length, Max, MaxLength, Min } from 'class-validator';

/** File types accepted for KYC documents. */
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** A file already uploaded to storage via a presigned URL, referenced by key. */
export class SchoolRequestDocumentDto {
  @ApiProperty({ enum: SchoolRequestDocumentType })
  @IsEnum(SchoolRequestDocumentType)
  type: SchoolRequestDocumentType;

  @ApiProperty({ description: 'Storage key returned by POST /school-requests/uploads' })
  @IsString()
  @MaxLength(512)
  key: string;

  @ApiProperty({ example: 'national-id.pdf' })
  @IsString()
  @Length(1, 200)
  fileName: string;

  @ApiProperty({ enum: DOCUMENT_MIME_TYPES })
  @IsIn(DOCUMENT_MIME_TYPES)
  mimeType: string;

  @ApiProperty({ maximum: DOCUMENT_MAX_BYTES })
  @IsInt()
  @Min(1)
  @Max(DOCUMENT_MAX_BYTES)
  sizeBytes: number;
}
