import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class PreviewCustomerChangeDto {
  @ApiProperty({ example: 'cust_old_01H...' })
  @IsString()
  currentCustomerId!: string;

  @ApiProperty({ example: 'cust_new_01H...' })
  @IsString()
  newCustomerId!: string;

  @ApiProperty({ example: ['inbound_item_1', 'inbound_item_2'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  inboundItemIds!: string[];
}
