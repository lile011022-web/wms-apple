import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReportExportStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ReportType } from './report-type';

export class ListReportExportsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReportType })
  @IsOptional()
  @IsEnum(ReportType)
  reportType?: ReportType;

  @ApiPropertyOptional({ enum: ReportExportStatus })
  @IsOptional()
  @IsEnum(ReportExportStatus)
  status?: ReportExportStatus;
}
