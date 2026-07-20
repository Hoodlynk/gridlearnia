import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class VerifyTwoFactorDto {
  @ApiProperty({ description: 'The challenge token returned by /auth/login' })
  @IsString()
  @Length(16, 512)
  challengeToken: string;

  @ApiProperty({ description: 'The 6-digit code from the email', example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}
