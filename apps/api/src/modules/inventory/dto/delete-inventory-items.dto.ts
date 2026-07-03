import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

export class DeleteInventoryItemsDto {
  @ApiProperty({ example: 'customer_01H...' })
  @IsString()
  customerId!: string;

  @ApiPropertyOptional({ example: 'warehouse_01H...' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiProperty({ example: ['inventory_01H...'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  itemIds!: string[];
}
