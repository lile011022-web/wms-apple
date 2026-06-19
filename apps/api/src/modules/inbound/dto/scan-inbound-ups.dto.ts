import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ScanInboundUpsDto {
  @ApiProperty({
    example: '1Z999AA10123456784',
    description:
      'UPS, USPS, or FedEx package tracking number. The legacy field name is kept for API compatibility.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(40)
  upsTrackingNo: string;
}
