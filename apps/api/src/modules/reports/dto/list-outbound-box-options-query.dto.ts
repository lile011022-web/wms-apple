import { ApiPropertyOptional } from '@nestjs/swagger';
import { OutboundBoxStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListOutboundBoxOptionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'cust_01H...' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'wh_01H...' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: OutboundBoxStatus })
  @IsOptional()
  @IsEnum(OutboundBoxStatus)
  outboundStatus?: OutboundBoxStatus;

  @ApiPropertyOptional({ example: '12*12*12' })
  @IsOptional()
  @IsString()
  sizePreset?: string;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-06-30T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
