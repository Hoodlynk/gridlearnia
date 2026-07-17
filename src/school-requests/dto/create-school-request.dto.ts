import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
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

  @ApiProperty({ example: '32115678', description: 'National ID or passport number' })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9\-\/ ]{2,48}[A-Za-z0-9]$/, {
    message: 'idNumber must be 4-50 letters, numbers, hyphens, or slashes',
  })
  idNumber: string;

  @ApiProperty({ example: '+254712345678' })
  @IsString()
  @Matches(/^\+?[0-9][0-9 \-]{5,18}[0-9]$/, {
    message: 'phone must be 7-20 digits, optionally starting with +',
  })
  phone: string;

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
