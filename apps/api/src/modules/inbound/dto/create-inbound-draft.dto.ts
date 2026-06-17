import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInboundDraftDto {
  @ApiPropertyOptional({ example: 'cust_01H...' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'wh_01H...' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'Morning receiving lane A' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
