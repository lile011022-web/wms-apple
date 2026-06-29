import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PreviewReportDto } from './preview-report.dto';
import { ReportExportFormat } from './report-export-format';
import { ReportExportLayout } from './report-export-layout';

export class CreateReportExportDto extends PreviewReportDto {
  @ApiProperty({ enum: ReportExportFormat })
  @IsEnum(ReportExportFormat)
  format: ReportExportFormat;

  @ApiPropertyOptional({
    description:
      'When present, creates a new export using the same report type, filters, and fields.',
  })
  @IsOptional()
  @IsString()
  sourceExportId?: string;

  @ApiPropertyOptional({
    enum: ReportExportLayout,
    description:
      'Optional Excel layout. PACKED_SUMMARY applies to outbound detail Excel exports; WAREHOUSE_HOLD applies to inventory detail Excel exports.',
  })
  @IsOptional()
  @IsEnum(ReportExportLayout)
  exportLayout?: ReportExportLayout;
}
