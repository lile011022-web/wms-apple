import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class ImportProductsDto {
  @ApiPropertyOptional({
    example: false,
    description: 'Update products with an existing SKU instead of rejecting the import.',
  })
  @IsOptional()
  @IsBoolean()
  updateExisting?: boolean;

  @ApiProperty({ type: [CreateProductDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateProductDto)
  products: CreateProductDto[];
}
