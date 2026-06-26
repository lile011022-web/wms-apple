import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CorrectInboundRecordUpcDto {
  @ApiProperty({ example: '9622080430009579265100530689178', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  upsTrackingNo?: string;

  @ApiProperty({ example: '195950251593' })
  @IsString()
  @MinLength(8)
  @MaxLength(14)
  upc: string;

  @ApiProperty({ example: '357017259903923', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  imei?: string;

  @ApiProperty({ example: 'SG3R4GR71M0', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  serial?: string;

  @ApiProperty({ example: 'Operator scanned IMEI into UPC field during receiving.' })
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  reason: string;
}
