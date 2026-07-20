import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GradingSchemeType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const KEY_RULE = /^[A-Za-z0-9][A-Za-z0-9-]{0,48}[A-Za-z0-9]$/;

export class CloneGradingSchemeDto {
  @ApiProperty({ description: 'System or own grading scheme to copy from' })
  @IsUUID()
  sourceGradingSchemeId: string;
}

export class CreateGradingSchemeDto {
  @ApiProperty({ example: 'HOUSE-POINTS', description: 'Unique key within the school' })
  @IsString()
  @Matches(KEY_RULE, {
    message: 'key must be 2–50 letters, digits, or hyphens',
  })
  key: string;

  @ApiProperty({ example: 'House Points' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @ApiProperty({ enum: GradingSchemeType })
  @IsEnum(GradingSchemeType)
  type: GradingSchemeType;
}

export class UpdateGradingSchemeDto {
  @ApiPropertyOptional({ example: 'House Points' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;
}

export class GradingBandDto {
  @ApiProperty({ example: 'A' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  label: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(100)
  order: number;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  minScore?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  maxScore?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  points?: number;

  @ApiPropertyOptional({ example: 'Exceeding Expectation' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  remark?: string;
}

export class ReplaceBandsDto {
  @ApiProperty({ type: [GradingBandDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GradingBandDto)
  bands: GradingBandDto[];
}
