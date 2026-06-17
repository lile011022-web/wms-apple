import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExceptionStatus, ExceptionType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListExceptionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ExceptionType })
  @IsOptional()
  @IsEnum(ExceptionType)
  type?: ExceptionType;

  @ApiPropertyOptional({ enum: ExceptionStatus })
  @IsOptional()
  @IsEnum(ExceptionStatus)
  status?: ExceptionStatus;

  @ApiPropertyOptional({ example: 'cust_01H...' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'wh_01H...' })
  @IsOptional()
  @IsString()
  warehouseId?: string;
}
