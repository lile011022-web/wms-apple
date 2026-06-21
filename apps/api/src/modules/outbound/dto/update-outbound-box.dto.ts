import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { outboundBoxSizePresets } from './create-outbound-box.dto';

export class UpdateOutboundBoxDto {
  @ApiPropertyOptional({ example: 'Customer A mixed iPhone box' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  boxName?: string;

  @ApiPropertyOptional({ enum: outboundBoxSizePresets, example: '14*14*14' })
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

  @ApiPropertyOptional({ example: 'Repacked after customer request' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
