import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateSectionDto {
  @ApiProperty({ description: 'Campus the section belongs to' })
  @IsUUID()
  campusId: string;

  @ApiProperty({ example: 'Primary' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  order?: number;

  @ApiPropertyOptional({ description: 'Curriculum this section runs' })
  @IsOptional()
  @IsUUID()
  curriculumId?: string;

  @ApiPropertyOptional({ description: 'Default grading scheme for the section' })
  @IsOptional()
  @IsUUID()
  gradingSchemeId?: string;
}

export class UpdateSectionDto {
  @ApiPropertyOptional({ example: 'Primary' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  order?: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Set to a curriculum id, or null to clear',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  curriculumId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Set to a grading scheme id, or null to clear',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  gradingSchemeId?: string | null;
}
