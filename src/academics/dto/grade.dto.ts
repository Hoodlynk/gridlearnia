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
} from 'class-validator';

export class CreateGradeDto {
  @ApiProperty({ description: 'Section the grade belongs to' })
  @IsUUID()
  sectionId: string;

  @ApiProperty({ example: 'Grade 1' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 1, description: 'Progression order within the section' })
  @IsInt()
  @Min(0)
  @Max(100)
  order: number;
}

export class UpdateGradeDto {
  @ApiPropertyOptional({ example: 'Grade 1' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  order?: number;
}
