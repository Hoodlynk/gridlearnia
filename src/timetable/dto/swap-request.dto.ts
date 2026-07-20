import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSwapRequestDto {
  @ApiProperty({ description: 'The lesson to move (must be the requester’s)' })
  @IsUUID()
  entryId: string;

  @ApiPropertyOptional({ description: 'Swap with this lesson…' })
  @IsOptional()
  @IsUUID()
  targetEntryId?: string;

  @ApiPropertyOptional({ description: '…or move to this day (ISO weekday)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  targetDay?: number;

  @ApiPropertyOptional({ description: '…and this period' })
  @IsOptional()
  @IsUUID()
  targetPeriodId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class DecideSwapRequestDto {
  @ApiPropertyOptional({ description: 'A note shown to the requester' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
