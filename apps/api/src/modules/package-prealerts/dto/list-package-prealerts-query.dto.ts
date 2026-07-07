import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  PackageAlertStatus,
  PackageAlertType,
  PackageLogisticsStatus,
  PackageReceivingStatus,
} from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListPackagePrealertsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'cust_01H...' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ enum: PackageLogisticsStatus })
  @IsOptional()
  @IsEnum(PackageLogisticsStatus)
  logisticsStatus?: PackageLogisticsStatus;

  @ApiPropertyOptional({ enum: PackageReceivingStatus })
  @IsOptional()
  @IsEnum(PackageReceivingStatus)
  receivingStatus?: PackageReceivingStatus;
}

export class ListPackageAlertsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PackageAlertStatus })
  @IsOptional()
  @IsEnum(PackageAlertStatus)
  status?: PackageAlertStatus;

  @ApiPropertyOptional({ enum: PackageAlertType })
  @IsOptional()
  @IsEnum(PackageAlertType)
  alertType?: PackageAlertType;

  @ApiPropertyOptional({ example: 'cust_01H...' })
  @IsOptional()
  @IsString()
  customerId?: string;
}
