import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class BulkDeletePackagePrealertsDto {
  @ApiProperty({
    example: ['prealert_item_01H...', 'prealert_item_01J...'],
    maxItems: 200,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids!: string[];
}
