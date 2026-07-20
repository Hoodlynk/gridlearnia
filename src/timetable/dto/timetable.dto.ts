import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
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

export class CreateTimetableDto {
  @ApiProperty({ description: 'Academic year this timetable belongs to' })
  @IsUUID()
  academicYearId: string;

  @ApiPropertyOptional({ description: 'Term, when the timetable maps to one' })
  @IsOptional()
  @IsUUID()
  termId?: string;

  @ApiProperty({ example: 'Term 1 2026' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '2026-01-08', description: 'First day it applies' })
  @IsDateString()
  effectiveFrom: string;

  @ApiPropertyOptional({
    example: '2026-04-10',
    description: 'Last day it applies; omit for "until superseded"',
  })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class UpdateTimetableDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  termId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ description: 'null clears the end date' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  effectiveTo?: string | null;
}

export class MoveEntryDto {
  @ApiProperty({ example: 1, description: 'ISO weekday to move to' })
  @IsInt()
  @Min(1)
  @Max(7)
  day: number;

  @ApiProperty({ description: 'Period to move to' })
  @IsUUID()
  periodId: string;

  @ApiPropertyOptional({ description: 'Room (null to clear)' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  roomId?: string | null;
}

export class SwapEntriesDto {
  @ApiProperty({ description: 'The lesson to swap slots with' })
  @IsUUID()
  targetEntryId: string;
}

export class GenerateTimetableDto {
  @ApiPropertyOptional({
    description: 'Fix the random seed to reproduce a previous run exactly',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  seed?: number;
}

export class PublishTimetableDto {
  @ApiPropertyOptional({
    description:
      'Close the current open-ended timetable the day before this one starts',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  supersedeCurrent?: boolean;

  @ApiPropertyOptional({
    description: 'Allow an effectiveFrom in the past (corrections/backfill)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowBackdate?: boolean;
}
