import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Sciences' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'SCI' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @ApiPropertyOptional({ description: 'Head of department (a staff member)' })
  @IsOptional()
  @IsUUID()
  headId?: string;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @ApiPropertyOptional({ description: 'Head of department (null to clear)' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  headId?: string | null;
}

export class AddDepartmentSubjectDto {
  @ApiProperty({ description: 'Subject to attach to the department' })
  @IsUUID()
  subjectId: string;
}
