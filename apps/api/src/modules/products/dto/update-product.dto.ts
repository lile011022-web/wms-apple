import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'IPHONE-16-PRO-256-NAT' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  sku?: string;

  @ApiPropertyOptional({ example: 'Apple' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @ApiPropertyOptional({ example: 'iPhone 16 Pro 256GB Natural Titanium' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @ApiPropertyOptional({ example: 'iPhone 16 Pro' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @ApiPropertyOptional({ example: 'MG7K4LL/A', description: 'Display-only Apple Part No. / MPN.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  modelCode?: string;

  @ApiPropertyOptional({ example: 'iPhone' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ example: 'Natural Titanium' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  color?: string;

  @ApiPropertyOptional({ example: '256GB' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  capacity?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  requiresImei?: boolean;

  @ApiPropertyOptional({ example: ['194253149189'] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  upcs?: string[];
}
