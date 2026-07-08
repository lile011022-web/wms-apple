import { ApiPropertyOptional } from '@nestjs/swagger';
import { InboundItemStatus, InventoryStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListInboundRecordsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'batch_01H...' })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional({ example: 'cust_01H...' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'alias_01H...' })
  @IsOptional()
  @IsString()
  customerAliasId?: string;

  @ApiPropertyOptional({ example: 'wh_01H...' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: InboundItemStatus })
  @IsOptional()
  @IsEnum(InboundItemStatus)
  status?: InboundItemStatus;

  @ApiPropertyOptional({ enum: InventoryStatus })
  @IsOptional()
  @IsEnum(InventoryStatus)
  inventoryStatus?: InventoryStatus;

  @ApiPropertyOptional({ example: '1Z999AA10123456784' })
  @IsOptional()
  @IsString()
  upsTrackingNo?: string;

  @ApiPropertyOptional({ example: '194253149189' })
  @IsOptional()
  @IsString()
  upc?: string;

  @ApiPropertyOptional({ example: '356789012345678' })
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiPropertyOptional({ example: 'F2LV1234ABCD' })
  @IsOptional()
  @IsString()
  serial?: string;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-06-30T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
