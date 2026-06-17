import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PreviewReportDto } from './preview-report.dto';
import { ReportExportFormat } from './report-export-format';

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
}
