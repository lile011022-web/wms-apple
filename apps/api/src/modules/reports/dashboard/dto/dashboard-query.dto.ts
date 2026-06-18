import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional({ example: 'wh_01H...' })
  @IsOptional()
  @IsString()
  warehouseId?: string;
}
