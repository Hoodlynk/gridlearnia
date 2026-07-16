import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class CreateSchoolRequestDto {
  @ApiProperty({ example: 'Sunrise Academy' })
  @IsString()
  @Length(2, 255)
  name: string;

  @ApiProperty({
    example: 'sunrise',
    description: 'Lowercase letters, numbers, and hyphens; 3-63 chars',
  })
  @IsString()
  @Matches(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/, {
    message:
      'subdomain must be 3-63 lowercase letters, numbers, or hyphens, and cannot start or end with a hyphen',
  })
  subdomain: string;
}
