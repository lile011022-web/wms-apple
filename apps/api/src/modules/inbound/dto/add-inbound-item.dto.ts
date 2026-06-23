import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const inboundScanModes = ['STANDARD', 'TRACKING_UPC'] as const;
export type InboundScanMode = (typeof inboundScanModes)[number];

export class AddInboundItemDto {
  @ApiProperty({ example: '194253149189' })
  @IsString()
  @MinLength(8)
  @MaxLength(14)
  upc: string;

  @ApiPropertyOptional({
    example: '9400111899223857000000',
    description:
      'UPS, USPS, or FedEx package tracking number. The legacy field name is kept for API compatibility.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  upsTrackingNo?: string;

  @ApiPropertyOptional({ example: '356789012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  imei?: string;

  @ApiPropertyOptional({ example: 'FVFYX1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  serial?: string;

  @ApiPropertyOptional({
    enum: inboundScanModes,
    example: 'STANDARD',
    description:
      'STANDARD requires package tracking, UPC, and IMEI/Serial. TRACKING_UPC allows package tracking + UPC only.',
  })
  @IsOptional()
  @IsIn(inboundScanModes)
  scanMode?: InboundScanMode;

  @ApiPropertyOptional({
    example: true,
    description:
      'Set after the operator confirms an abnormal package tracking warning. Allows saving unsupported tracking formats.',
  })
  @IsOptional()
  @IsBoolean()
  trackingExceptionConfirmed?: boolean;
}
