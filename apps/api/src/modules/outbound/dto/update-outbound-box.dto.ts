import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { outboundBoxSizePresets } from './create-outbound-box.dto';

export class UpdateOutboundBoxDto {
  @ApiProperty({
    example: '2026-07-10T12:00:00.000Z',
    description: 'The updatedAt value returned by the latest box read.',
  })
  @IsDateString()
  expectedUpdatedAt!: string;

  @ApiPropertyOptional({ example: 'Apple Reseller20260618箱1-A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  boxName?: string;

  @ApiPropertyOptional({ enum: outboundBoxSizePresets, example: '16*16*12' })
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

  @ApiPropertyOptional({ example: 'Repacked after customer request' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
