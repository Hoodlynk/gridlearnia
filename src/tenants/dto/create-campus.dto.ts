import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCampusDto {
  @ApiProperty({ example: 'Mombasa Campus' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({
    example: 'MOMBASA',
    description: 'Short handle, unique within the school (A-Z, 0-9, _ , -).',
  })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,50}$/, {
    message: 'code must be 2–50 chars: letters, digits, underscore or hyphen',
  })
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'Africa/Nairobi', description: 'IANA tz; inherits the school when unset.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;
}
