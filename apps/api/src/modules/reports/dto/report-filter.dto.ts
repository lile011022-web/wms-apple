import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuditAction,
  ExceptionStatus,
  ExceptionType,
  InboundItemStatus,
  InventoryStatus,
  OutboundBoxStatus,
} from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class ReportFilterDto {
  @ApiPropertyOptional({ example: 'cust_01H...' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'wh_01H...' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ example: 'prod_01H...' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ example: 'user_01H...' })
  @IsOptional()
  @IsString()
  operatorId?: string;

  @ApiPropertyOptional({ example: 'report-export' })
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional({ example: 'batch_01H...' })
  @IsOptional()
  @IsString()
  batchId?: string;

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

  @ApiPropertyOptional({ example: '1Z999AA10123456784' })
  @IsOptional()
  @IsString()
  upsTrackingNo?: string;

  @ApiPropertyOptional({ example: 'BOX-20260617-001' })
  @IsOptional()
  @IsString()
  boxNo?: string;

  @ApiPropertyOptional({ example: 'iPhone 15 Pro' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: InboundItemStatus })
  @IsOptional()
  @IsEnum(InboundItemStatus)
  inboundStatus?: InboundItemStatus;

  @ApiPropertyOptional({ enum: InventoryStatus })
  @IsOptional()
  @IsEnum(InventoryStatus)
  inventoryStatus?: InventoryStatus;

  @ApiPropertyOptional({ enum: OutboundBoxStatus })
  @IsOptional()
  @IsEnum(OutboundBoxStatus)
  outboundStatus?: OutboundBoxStatus;

  @ApiPropertyOptional({ enum: ExceptionType })
  @IsOptional()
  @IsEnum(ExceptionType)
  exceptionType?: ExceptionType;

  @ApiPropertyOptional({ enum: ExceptionStatus })
  @IsOptional()
  @IsEnum(ExceptionStatus)
  exceptionStatus?: ExceptionStatus;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  auditAction?: AuditAction;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-06-30T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
