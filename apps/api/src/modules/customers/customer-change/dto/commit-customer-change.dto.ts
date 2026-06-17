import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, MinLength } from 'class-validator';

export class CommitCustomerChangeDto {
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

  @ApiProperty({ example: 'Customer was selected incorrectly during receiving.' })
  @IsString()
  @MinLength(3)
  reason!: string;

  @ApiProperty({ example: 'sha256-preview-token' })
  @IsString()
  previewToken!: string;
}
