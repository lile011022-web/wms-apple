import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateOutboundBoxItemDto {
  @ApiProperty({ example: '1Z999AA10123456784' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  upsTrackingNo!: string;

  @ApiProperty({ example: '194253149189' })
  @IsString()
  @MinLength(8)
  @MaxLength(14)
  upc!: string;

  @ApiPropertyOptional({ example: '356789012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  imeiOrSerial?: string;

  @ApiProperty({ example: '2026-07-10T08:00:00.000Z' })
  @IsISO8601()
  expectedBoxUpdatedAt!: string;
}
