import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryStatus } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class DeleteInventoryProductsDto {
  @ApiProperty({ example: 'customer_01H...' })
  @IsString()
  customerId!: string;

  @ApiPropertyOptional({ example: 'warehouse_01H...' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiProperty({ example: ['product_01H...'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  productIds!: string[];

  @ApiPropertyOptional({ enum: InventoryStatus })
  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

  @ApiPropertyOptional({ example: '2026-07-08T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-07-08T23:59:59.999Z' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
