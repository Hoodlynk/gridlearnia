import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty({ description: 'The invitation token from the invite link' })
  @IsString()
  @Length(64, 64)
  @Matches(/^[a-f0-9]{64}$/)
  token: string;
}
