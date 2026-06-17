import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AddOutboundBoxItemDto {
  @ApiProperty({ example: 'inventory_01H...' })
  @IsString()
  inventoryItemId: string;
}
