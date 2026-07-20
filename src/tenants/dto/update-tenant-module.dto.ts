import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class UpdateTenantModuleDto {
  @ApiPropertyOptional({ description: 'Turn the module on or off for the school.' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Per-module quotas/config, e.g. { "maxSmsPerMonth": 5000 }.',
  })
  @IsOptional()
  @IsObject()
  limits?: Record<string, unknown>;
}
