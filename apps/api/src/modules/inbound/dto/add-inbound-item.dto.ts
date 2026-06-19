import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
}
