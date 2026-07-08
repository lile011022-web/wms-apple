import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ListCustomerAliasOptionsQueryDto {
  @ApiPropertyOptional({ example: 'cust_01H...' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 'A1' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}
