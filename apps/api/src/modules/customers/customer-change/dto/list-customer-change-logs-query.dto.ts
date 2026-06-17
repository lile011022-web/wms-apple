import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export class ListCustomerChangeLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'cust_old_01H...' })
  @IsOptional()
  @IsString()
  oldCustomerId?: string;

  @ApiPropertyOptional({ example: 'cust_new_01H...' })
  @IsOptional()
  @IsString()
  newCustomerId?: string;

  @ApiPropertyOptional({ example: 'operator_01H...' })
  @IsOptional()
  @IsString()
  operatorId?: string;
}
