import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EnrollmentStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateEnrollmentDto {
  @ApiProperty({ description: 'Student to enroll' })
  @IsUUID()
  studentId: string;

  @ApiProperty({ description: 'Class the student joins' })
  @IsUUID()
  classId: string;

  @ApiProperty({ description: 'Academic year of the enrollment' })
  @IsUUID()
  academicYearId: string;

  @ApiPropertyOptional({ example: '12', description: 'Roll/register number' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rollNumber?: string;
}

export class UpdateEnrollmentDto {
  @ApiPropertyOptional({ description: 'Move the student to another class in the same year' })
  @IsOptional()
  @IsUUID()
  classId?: string;

  @ApiPropertyOptional({ example: '12' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  rollNumber?: string;

  @ApiPropertyOptional({ enum: EnrollmentStatus })
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;

  @ApiPropertyOptional({ example: '2026-06-30', description: 'Exit date (ISO)' })
  @IsOptional()
  @IsDateString()
  exitedOn?: string;
}
