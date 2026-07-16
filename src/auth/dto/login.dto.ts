import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'acme' })
  @IsString()
  @MaxLength(100)
  tenantSubdomain: string;

  @ApiProperty({ example: 'owner@acme.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'S3cure-password' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}
