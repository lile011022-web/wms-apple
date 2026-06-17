import { ApiPropertyOptional } from '@nestjs/swagger';
import { OutboundBoxStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListOutboundBoxesQueryDto extends PaginationQueryDto {
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
  status?: OutboundBoxStatus;
}
