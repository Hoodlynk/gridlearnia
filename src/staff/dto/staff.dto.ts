import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentType, StaffStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({ description: 'Home campus of the staff member' })
  @IsUUID()
  campusId: string;

  @ApiProperty({ example: 'TSC-001', description: 'Unique within the school' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  staffNumber: string;

  @ApiPropertyOptional({ example: 'Mr' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  title?: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @ApiProperty({ example: 'Kamau' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ enum: StaffStatus })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @ApiPropertyOptional({ example: '2024-01-08' })
  @IsOptional()
  @IsDateString()
  joinedOn?: string;

  @ApiPropertyOptional({ description: 'Primary department' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

/** Invite a staff member to the portal (creates a role-carrying invitation). */
export class InviteStaffDto {
  @ApiPropertyOptional({
    description: "Defaults to the staff member's own email address",
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiProperty({
    example: ['TEACHER'],
    description: 'Roles granted on acceptance',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  roleKeys: string[];
}

/** Link (or unlink, with null) an existing school user to a staff profile. */
export class LinkStaffUserDto {
  @ApiPropertyOptional({ description: 'User to link (null to unlink)' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  userId?: string | null;
}

export class UpdateStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  campusId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  staffNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ enum: StaffStatus })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  joinedOn?: string;

  @ApiPropertyOptional({ description: 'Primary department (null to clear)' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  departmentId?: string | null;
}
