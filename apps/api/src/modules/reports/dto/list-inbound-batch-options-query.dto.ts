import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListInboundBatchOptionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'cust_01H...' })
  @IsOptional()
  @IsString()
  customerId?: string;
}
