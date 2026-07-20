import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateClassDto {
  @ApiProperty({ description: 'Grade the class belongs to' })
  @IsUUID()
  gradeId: string;

  @ApiProperty({ description: 'Academic year the class runs in' })
  @IsUUID()
  academicYearId: string;

  @ApiProperty({ example: 'East', description: 'Stream name within the grade' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;
}

export class UpdateClassDto {
  @ApiPropertyOptional({ example: 'West' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;
}
