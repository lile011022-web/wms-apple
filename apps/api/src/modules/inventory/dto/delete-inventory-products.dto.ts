import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

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
}
