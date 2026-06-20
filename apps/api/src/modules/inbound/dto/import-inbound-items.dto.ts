import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { AddInboundItemDto } from './add-inbound-item.dto';

export class ImportInboundItemsDto {
  @ApiProperty({ type: [AddInboundItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => AddInboundItemDto)
  items: AddInboundItemDto[];
}
