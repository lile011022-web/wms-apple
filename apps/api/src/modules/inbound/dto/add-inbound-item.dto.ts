import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AddInboundItemDto {
  @ApiProperty({ example: '194253149189' })
  @IsString()
  @MinLength(8)
  @MaxLength(14)
  upc: string;

  @ApiPropertyOptional({ example: '1Z999AA10123456784' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
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
