import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

// Platform-level login: emails are globally unique.
export class LoginDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'S3cure-password' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}
