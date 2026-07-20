import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateAssessmentDto {
  @ApiProperty({ description: 'Class being assessed' })
  @IsUUID()
  classId: string;

  @ApiProperty({ description: 'Subject of the assessment' })
  @IsUUID()
  subjectId: string;

  @ApiPropertyOptional({ description: 'Term within the class year' })
  @IsOptional()
  @IsUUID()
  termId?: string;

  @ApiProperty({ example: 'Mid-Term Exam' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxScore?: number;

  @ApiPropertyOptional({ example: '2026-03-15' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class UpdateAssessmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: 'Set null to clear the term' })
  @IsOptional()
  @IsUUID()
  termId?: string | null;
}

export class SaveScoreEntryDto {
  @ApiProperty({ description: 'Enrollment being scored' })
  @IsUUID()
  enrollmentId: string;

  @ApiProperty({ example: 78 })
  @IsNumber()
  @Min(0)
  score: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

export class SaveScoresDto {
  @ApiProperty({ type: [SaveScoreEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaveScoreEntryDto)
  entries: SaveScoreEntryDto[];
}
