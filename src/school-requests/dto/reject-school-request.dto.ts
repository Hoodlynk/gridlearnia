import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectSchoolRequestDto {
  @ApiPropertyOptional({ example: 'Subdomain conflicts with a trademark' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
