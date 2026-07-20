import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateGuardianDto {
  @ApiProperty({ example: 'Mary' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Otieno' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ example: '+254700000000' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: 'Engineer' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  occupation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

export class UpdateGuardianDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  occupation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

/** Link an existing guardian to a student (POST /students/:id/guardians). */
export class LinkGuardianDto {
  @ApiProperty({ description: 'Existing guardian to link' })
  @IsUUID()
  guardianId: string;

  @ApiProperty({ example: 'Mother' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  relationship: string;

  @ApiPropertyOptional({ description: 'Mark as the primary contact' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

/** Create a new guardian and link it to a student in one call. */
export class CreateAndLinkGuardianDto extends CreateGuardianDto {
  @ApiProperty({ example: 'Mother' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  relationship: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
