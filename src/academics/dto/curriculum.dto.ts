import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const KEY_RULE = /^[A-Za-z0-9][A-Za-z0-9-]{0,48}[A-Za-z0-9]$/;

export class CloneCurriculumDto {
  @ApiProperty({ description: 'System or own curriculum to copy from' })
  @IsUUID()
  sourceCurriculumId: string;
}

export class CreateCurriculumDto {
  @ApiProperty({ example: 'CBC-CUSTOM', description: 'Unique key within the school' })
  @IsString()
  @Matches(KEY_RULE, {
    message: 'key must be 2–50 letters, digits, or hyphens',
  })
  key: string;

  @ApiProperty({ example: 'Our CBC Variant' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: 'KE', description: 'ISO 3166-1 alpha-2' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;
}

export class UpdateCurriculumDto {
  @ApiPropertyOptional({ example: 'Our CBC Variant' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: 'KE' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;
}

export class CreateSubjectDto {
  @ApiProperty({ example: 'MATH' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code: string;

  @ApiProperty({ example: 'Mathematics' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;
}

export class UpdateSubjectDto {
  @ApiPropertyOptional({ example: 'MATH' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code?: string;

  @ApiPropertyOptional({ example: 'Mathematics' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;
}
