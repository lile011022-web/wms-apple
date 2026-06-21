import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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

  @ApiPropertyOptional({ example: 'BOX-20260617-001' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  boxNo?: string;

  @ApiPropertyOptional({ example: 'Customer A mixed iPhone box' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
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

  @ApiPropertyOptional({ example: 'Outbound packing lane A' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
