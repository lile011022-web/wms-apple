import { ApiPropertyOptional } from '@nestjs/swagger';
import { PackageLogisticsStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePackagePrealertStatusDto {
  @ApiPropertyOptional({ enum: PackageLogisticsStatus })
  @IsOptional()
  @IsEnum(PackageLogisticsStatus)
  logisticsStatus?: PackageLogisticsStatus;

  @ApiPropertyOptional({ example: 'Delivered, Front Desk' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rawLogisticsStatus?: string;

  @ApiPropertyOptional({ example: '2026-07-08T18:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  logisticsUpdatedAt?: string;

  @ApiPropertyOptional({ example: '2026-07-08T18:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  estimatedArrivalAt?: string;

  @ApiPropertyOptional({ example: '2026-07-08T21:13:00.000Z' })
  @IsOptional()
  @IsDateString()
  deliveredAt?: string;

  @ApiPropertyOptional({ example: 'Los Angeles, CA' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;
}
