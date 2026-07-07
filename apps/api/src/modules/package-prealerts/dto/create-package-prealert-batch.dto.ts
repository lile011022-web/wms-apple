import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePackagePrealertItemDto {
  @ApiPropertyOptional({ example: 'UPS' })
  @IsOptional()
  @IsString()
  carrier?: string;

  @ApiPropertyOptional({ example: '1Z999AA10123456784' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  trackingNo?: string;

  @ApiPropertyOptional({ example: 'https://www.ups.com/track?tracknum=1Z999AA10123456784' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  trackingLink?: string;

  @ApiPropertyOptional({ example: '2026-07-08T18:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  estimatedArrivalAt?: string;

  @ApiPropertyOptional({ example: 'iPhone 17 256GB Mist Blue' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  productModel?: string;

  @ApiPropertyOptional({ example: 'Patricia M' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @ApiPropertyOptional({ example: '客户说本周会到仓' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreatePackagePrealertBatchDto {
  @ApiProperty({ example: 'cust_01H...' })
  @IsString()
  @MinLength(1)
  customerId!: string;

  @ApiPropertyOptional({ example: 'MANUAL' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;

  @ApiPropertyOptional({ example: '客户微信预报' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [CreatePackagePrealertItemDto] })
  @IsArray()
  items!: CreatePackagePrealertItemDto[];
}
