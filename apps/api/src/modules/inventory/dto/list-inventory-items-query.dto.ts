import { ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListInventoryItemsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'customer_123' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'warehouse_123' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'product_123' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ enum: InventoryStatus })
  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

  @ApiPropertyOptional({ example: '194253149189' })
  @IsOptional()
  @IsString()
  upc?: string;

  @ApiPropertyOptional({ example: '356789012345678' })
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiPropertyOptional({ example: 'F2LXL0ABCDEF' })
  @IsOptional()
  @IsString()
  serial?: string;

  @ApiPropertyOptional({ example: '1Z999AA10123456784' })
  @IsOptional()
  @IsString()
  upsTrackingNo?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  availableForOutbound?: boolean;

  @ApiPropertyOptional({ example: '2026-06-28' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-06-28' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
