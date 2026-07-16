import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Acme Inc' })
  @IsString()
  @Length(2, 255)
  tenantName: string;

  @ApiProperty({
    example: 'acme',
    description: 'Lowercase letters, numbers, and hyphens; 3-63 chars',
  })
  @IsString()
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/, {
    message:
      'tenantSubdomain must be 3-63 lowercase letters, numbers, or hyphens, and cannot start or end with a hyphen',
  })
  tenantSubdomain: string;

  @ApiProperty({ example: 'owner@acme.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'S3cure-password' })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt truncates beyond 72 bytes
  password: string;

  @ApiPropertyOptional({ example: 'Jane' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}
