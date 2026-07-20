import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class CreateTeachingAssignmentDto {
  @ApiProperty({ description: 'Teacher being assigned' })
  @IsUUID()
  staffId: string;

  @ApiProperty({ description: 'Class the teacher will teach in' })
  @IsUUID()
  classId: string;

  @ApiProperty({ description: 'Subject the teacher will teach' })
  @IsUUID()
  subjectId: string;
}

export class SetClassTeacherDto {
  @ApiProperty({ description: 'Class to set the class teacher for' })
  @IsUUID()
  classId: string;

  @ApiPropertyOptional({ description: 'Staff member (null to clear)' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  staffId?: string | null;
}
