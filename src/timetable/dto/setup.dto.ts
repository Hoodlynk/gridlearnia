import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoomType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
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

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── Settings ────────────────────────────────────────────────────────────────

export class UpdateTimetableSettingsDto {
  @ApiPropertyOptional({
    example: [1, 2, 3, 4, 5],
    description: 'ISO weekdays taught (1 = Monday)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  teachingDays?: number[];

  @ApiPropertyOptional({ example: '08:00', description: 'When the school day starts' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'dayStartTime must be HH:MM' })
  dayStartTime?: string;

  @ApiPropertyOptional({ example: 40, description: 'Default length of one lesson' })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  lessonDurationMinutes?: number;

  @ApiPropertyOptional({ example: 8, description: 'Teaching periods per day' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  lessonsPerDay?: number;

  @ApiPropertyOptional({ description: 'Default cap on a teacher’s daily load' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPeriodsPerTeacherPerDay?: number;

  @ApiPropertyOptional({ description: 'Cap on lessons one class may have in a day' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxLessonsPerClassPerDay?: number;

  @ApiPropertyOptional({
    description: 'Periods with order <= this count as morning',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  morningEndsAfterPeriod?: number;
}

// ── Schedule builder ────────────────────────────────────────────────────────

export class ScheduleBreakDto {
  @ApiProperty({ example: 'Break', description: 'Label shown on the grid' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({
    example: 2,
    description: 'Insert this break after the Nth lesson of the day',
  })
  @IsInt()
  @Min(1)
  @Max(20)
  afterLesson: number;

  @ApiProperty({ example: 20 })
  @IsInt()
  @Min(1)
  @Max(240)
  durationMinutes: number;
}

/**
 * Build a whole bell schedule from the school's own layout: when the day
 * starts, how long a lesson is, how many there are, and where breaks fall.
 * Periods can still be hand-edited afterwards for irregular days.
 */
export class GeneratePeriodsDto {
  @ApiProperty({ example: '08:00' })
  @Matches(TIME_PATTERN, { message: 'dayStartTime must be HH:MM' })
  dayStartTime: string;

  @ApiProperty({ example: 40 })
  @IsInt()
  @Min(5)
  @Max(240)
  lessonDurationMinutes: number;

  @ApiProperty({ example: 8 })
  @IsInt()
  @Min(1)
  @Max(20)
  lessonsPerDay: number;

  @ApiPropertyOptional({ type: [ScheduleBreakDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ScheduleBreakDto)
  breaks?: ScheduleBreakDto[];

  @ApiPropertyOptional({
    example: 'Lesson',
    description: 'Naming prefix — "Lesson 1", "Period 1"…',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  lessonLabel?: string;
}

// ── Periods (bell schedule) ─────────────────────────────────────────────────

export class PeriodInputDto {
  @ApiProperty({ example: 'Period 1' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 1, description: 'Position within the day' })
  @IsInt()
  @Min(1)
  @Max(30)
  order: number;

  @ApiProperty({ example: '08:00' })
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:MM' })
  startTime: string;

  @ApiProperty({ example: '08:40' })
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:MM' })
  endTime: string;

  @ApiPropertyOptional({ description: 'Breaks are never scheduled into' })
  @IsOptional()
  @IsBoolean()
  isBreak?: boolean;
}

/** Replace the whole bell schedule in one call — the grid is edited as a unit. */
export class ReplacePeriodsDto {
  @ApiProperty({ type: [PeriodInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PeriodInputDto)
  periods: PeriodInputDto[];
}

// ── Rooms ───────────────────────────────────────────────────────────────────

export class CreateRoomDto {
  @ApiProperty({ description: 'Campus the room is on' })
  @IsUUID()
  campusId: string;

  @ApiProperty({ example: 'Physics Lab' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'LAB-1' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code: string;

  @ApiPropertyOptional({ enum: RoomType })
  @IsOptional()
  @IsEnum(RoomType)
  type?: RoomType;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  capacity?: number;
}

export class UpdateRoomDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  campusId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code?: string;

  @ApiPropertyOptional({ enum: RoomType })
  @IsOptional()
  @IsEnum(RoomType)
  type?: RoomType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  capacity?: number;
}

// ── Requirements (the timetable demand, stored on TeachingAssignment) ────────

export class UpdateRequirementDto {
  @ApiPropertyOptional({ example: 5, description: 'Lessons per week; 0 = not timetabled' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(40)
  periodsPerWeek?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'How many of those are back-to-back pairs (each uses 2 periods)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  doublePeriods?: number;

  @ApiPropertyOptional({ enum: RoomType, description: 'Restrict to this room type' })
  @IsOptional()
  @IsEnum(RoomType)
  requiredRoomType?: RoomType | null;

  @ApiPropertyOptional({ description: 'Prefer earlier periods' })
  @IsOptional()
  @IsBoolean()
  preferMorning?: boolean;
}

// ── Staff unavailability ────────────────────────────────────────────────────

export class UnavailabilitySlotDto {
  @ApiProperty({ example: 1, description: 'ISO weekday (1 = Monday)' })
  @IsInt()
  @Min(1)
  @Max(7)
  day: number;

  @ApiProperty()
  @IsUUID()
  periodId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

/** Replace a staff member's blocked slots in one call (the grid is a unit). */
export class ReplaceUnavailabilityDto {
  @ApiProperty({ type: [UnavailabilitySlotDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UnavailabilitySlotDto)
  slots: UnavailabilitySlotDto[];

  @ApiPropertyOptional({ description: 'Cap on this teacher’s daily load' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPeriodsPerDay?: number;
}
