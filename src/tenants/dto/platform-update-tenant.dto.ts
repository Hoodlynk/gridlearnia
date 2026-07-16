import { ApiPropertyOptional } from '@nestjs/swagger';
import { TenantStatus, TenantTier } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class PlatformUpdateTenantDto {
  @ApiPropertyOptional({ enum: TenantTier })
  @IsOptional()
  @IsEnum(TenantTier)
  tier?: TenantTier;

  @ApiPropertyOptional({ enum: TenantStatus })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({ example: 500, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxUsers?: number;
}
