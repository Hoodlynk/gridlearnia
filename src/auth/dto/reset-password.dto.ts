import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'The token from the reset link' })
  @IsString()
  @Length(16, 255)
  token: string;

  @ApiProperty({ example: 'S3cure-password' })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt truncates beyond 72 bytes
  password: string;
}
