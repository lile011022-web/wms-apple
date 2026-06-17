import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ScanInboundUpsDto {
  @ApiProperty({ example: '1Z999AA10123456784' })
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  upsTrackingNo: string;
}
