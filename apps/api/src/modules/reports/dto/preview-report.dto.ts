import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ReportFilterDto } from './report-filter.dto';
import { ReportType } from './report-type';

export class PreviewReportDto {
  @ApiProperty({ enum: ReportType })
  @IsEnum(ReportType)
  reportType: ReportType;

  @ApiPropertyOptional({ type: ReportFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReportFilterDto)
  filters?: ReportFilterDto;

  @ApiPropertyOptional({ example: ['imei', 'serial', 'customerCode'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fields?: string[];
}
