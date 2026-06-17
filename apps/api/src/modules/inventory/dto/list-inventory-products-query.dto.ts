import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
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
}
