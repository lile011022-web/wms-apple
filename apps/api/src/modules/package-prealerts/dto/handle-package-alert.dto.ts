import { ApiProperty } from '@nestjs/swagger';
import { PackageAlertStatus } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class HandlePackageAlertDto {
  @ApiProperty({
    enum: [PackageAlertStatus.IN_PROGRESS, PackageAlertStatus.RESOLVED, PackageAlertStatus.IGNORED],
  })
  @IsEnum(PackageAlertStatus)
  status!: PackageAlertStatus;

  @ApiProperty({ example: '已在仓库找到，等待入库。' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  resolutionNote!: string;
}
