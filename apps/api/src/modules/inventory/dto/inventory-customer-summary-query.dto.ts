import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class InventoryCustomerSummaryQueryDto {
  @ApiPropertyOptional({ example: 'customer_123' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'warehouse_123' })
  @IsOptional()
  @IsString()
  warehouseId?: string;
}
