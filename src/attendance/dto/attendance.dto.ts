import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class MarkAttendanceEntryDto {
  @ApiProperty({ description: 'Enrollment being marked' })
  @IsUUID()
  enrollmentId: string;

  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class MarkAttendanceDto {
  @ApiProperty({ description: 'Class whose register is being marked' })
  @IsUUID()
  classId: string;

  @ApiProperty({ example: '2026-07-19', description: 'ISO date' })
  @IsDateString()
  date: string;

  @ApiProperty({ type: [MarkAttendanceEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MarkAttendanceEntryDto)
  records: MarkAttendanceEntryDto[];
}
