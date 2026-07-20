import { ApiPropertyOptional } from '@nestjs/swagger';
import { CampusStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateCampusDto {
  @ApiPropertyOptional({ example: 'Mombasa Campus' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'MOMBASA' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,50}$/, {
    message: 'code must be 2–50 chars: letters, digits, underscore or hyphen',
  })
  code?: string;

  @ApiPropertyOptional({
    description: 'Promote this campus to the school main campus.',
  })
  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @ApiPropertyOptional({ enum: CampusStatus })
  @IsOptional()
  @IsEnum(CampusStatus)
  status?: CampusStatus;

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

  @ApiPropertyOptional({ example: 'Africa/Nairobi' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;
}
