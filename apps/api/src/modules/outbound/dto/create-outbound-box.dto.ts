import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOutboundBoxDto {
  @ApiPropertyOptional({ example: 'cust_01H...' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'wh_01H...' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'BOX-20260617-001' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  boxNo?: string;

  @ApiPropertyOptional({ example: 'Outbound packing lane A' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
