import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RequestChangesDto {
  @ApiProperty({
    example: 'The ID back scan is blurry — please re-upload a sharper photo.',
    description: 'What the applicant must fix before resubmitting',
  })
  @IsString()
  @Length(3, 1000)
  comments: string;
}
