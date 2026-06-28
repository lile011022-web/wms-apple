import { ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListInventoryProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'customer_123' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'warehouse_123' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: InventoryStatus })
  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

  @ApiPropertyOptional({ example: '2026-06-28' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-06-28' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
