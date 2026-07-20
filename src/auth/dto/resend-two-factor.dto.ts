import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ResendTwoFactorDto {
  @ApiProperty({ description: 'The challenge token returned by /auth/login' })
  @IsString()
  @Length(16, 512)
  challengeToken: string;
}
