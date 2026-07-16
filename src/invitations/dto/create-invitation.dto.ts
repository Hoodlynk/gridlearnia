import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty({ example: 'teacher@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: ['TEACHER', 'CLASS_TEACHER'],
    description:
      'Roles granted on acceptance. SUPER_ADMIN and ORGANIZATION_ADMIN cannot be invited.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @Matches(/^[A-Z][A-Z_]{1,49}$/, { each: true })
  roleKeys: string[];
}
