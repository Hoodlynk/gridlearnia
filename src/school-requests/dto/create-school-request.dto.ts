import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IdDocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { SECTION_OPTIONS } from '../../tenants/academic-provisioning';
import { SchoolRequestDocumentDto } from './school-request-document.dto';

export class CreateSchoolRequestDto {
  @ApiProperty({ example: 'Sunrise Academy' })
  @IsString()
  @Length(2, 255)
  name: string;

  @ApiProperty({
    example: 'sunrise',
    description: 'Lowercase letters, numbers, and hyphens; 3-63 chars',
  })
  @IsString()
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/, {
    message:
      'subdomain must be 3-63 lowercase letters, numbers, or hyphens, and cannot start or end with a hyphen',
  })
  subdomain: string;

  @ApiProperty({ example: 'Jane Wanjiku Kamau', description: 'Applicant legal name as on the ID document' })
  @IsString()
  @Length(2, 255)
  applicantFullName: string;

  @ApiProperty({
    enum: IdDocumentType,
    description:
      'NATIONAL_ID requires front and back scans; PASSPORT only the photo page',
  })
  @IsEnum(IdDocumentType)
  idType: IdDocumentType;

  @ApiProperty({ example: '32115678', description: 'National ID or passport number' })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9\-\/ ]{2,48}[A-Za-z0-9]$/, {
    message: 'idNumber must be 4-50 letters, numbers, hyphens, or slashes',
  })
  idNumber: string;

  @ApiProperty({
    example: '+254712345678',
    description: 'E.164 — the country code is mandatory',
  })
  @IsString()
  @Matches(/^\+[1-9][0-9]{6,14}$/, {
    message: 'phone must include a country code, e.g. +254712345678',
  })
  phone: string;

  @ApiPropertyOptional({
    enum: SECTION_OPTIONS,
    isArray: true,
    description:
      'Education bands the school offers — become Sections on approval',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SECTION_OPTIONS.length)
  @IsString({ each: true })
  @IsIn([...SECTION_OPTIONS], { each: true })
  sections?: string[];

  @ApiProperty({
    type: [SchoolRequestDocumentDto],
    description:
      'Uploaded KYC files — must include one ID_DOCUMENT and one SCHOOL_CERTIFICATE',
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => SchoolRequestDocumentDto)
  documents: SchoolRequestDocumentDto[];
}
