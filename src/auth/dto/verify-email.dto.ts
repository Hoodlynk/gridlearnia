import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'The token from the verification link' })
  @IsString()
  @Length(16, 255)
  token: string;
}
