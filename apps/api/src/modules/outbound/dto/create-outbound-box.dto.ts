import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const outboundBoxSizePresets = ['12*12*12', '14*14*14', 'CUSTOM'] as const;

export class CreateOutboundBoxDto {
  @ApiPropertyOptional({ example: 'cust_01H...' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'wh_01H...' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'Apple Reseller20260618箱1-A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  boxName?: string;

  @ApiPropertyOptional({ enum: outboundBoxSizePresets, example: '12*12*12' })
  @IsOptional()
  @IsIn(outboundBoxSizePresets)
  sizePreset?: string;

  @ApiPropertyOptional({ example: '16*14*12' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customSize?: string;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999)
  weightLb?: number;

  @ApiPropertyOptional({ example: '1Z999AA10123456784' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  shippingTrackingNo?: string;

  @ApiPropertyOptional({ example: 'Outbound packing lane A' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
