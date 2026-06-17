import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class UpdateWarehouseSettingsDto {
  @ApiPropertyOptional({ example: 'warehouse_id' })
  @IsOptional()
  @IsString()
  defaultWarehouseId?: string;
}

export class UpdateScanRulesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  requiresLockedCustomer?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enforceOutboundCustomerOwnership?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  detectDuplicateImei?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  detectDuplicateUps?: boolean;
}

export class UpdateExceptionHandlingDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  createUnmatchedUpcException?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  createDuplicateImeiException?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  createDuplicateUpsException?: boolean;
}

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  exceptionEmailEnabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  reportExportEmailEnabled?: boolean;
}

export class UpdateRetentionSettingsDto {
  @ApiPropertyOptional({ example: 365, minimum: 1, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  auditLogRetentionDays?: number;

  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  reportExportRetentionDays?: number;

  @ApiPropertyOptional({ example: 730, minimum: 1, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  exceptionRecordRetentionDays?: number;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({ type: UpdateWarehouseSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateWarehouseSettingsDto)
  warehouse?: UpdateWarehouseSettingsDto;

  @ApiPropertyOptional({ type: UpdateScanRulesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateScanRulesDto)
  scanRules?: UpdateScanRulesDto;

  @ApiPropertyOptional({ type: UpdateExceptionHandlingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateExceptionHandlingDto)
  exceptionHandling?: UpdateExceptionHandlingDto;

  @ApiPropertyOptional({ type: UpdateNotificationSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateNotificationSettingsDto)
  notifications?: UpdateNotificationSettingsDto;

  @ApiPropertyOptional({ type: UpdateRetentionSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateRetentionSettingsDto)
  retention?: UpdateRetentionSettingsDto;
}
