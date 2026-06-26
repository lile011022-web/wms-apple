import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CorrectInboundRecordUpcDto {
  @ApiProperty({ example: '195950251593' })
  @IsString()
  @MinLength(8)
  @MaxLength(14)
  upc: string;

  @ApiProperty({ example: 'Operator scanned IMEI into UPC field during receiving.' })
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  reason: string;
}
