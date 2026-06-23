import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateReportExportDto } from './dto/create-report-export.dto';
import { ListInboundBatchOptionsQueryDto } from './dto/list-inbound-batch-options-query.dto';
import { ListReportExportsQueryDto } from './dto/list-report-exports-query.dto';
import { PreviewReportDto } from './dto/preview-report.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('reports.export')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('preview')
  preview(@Body() dto: PreviewReportDto) {
    return this.reportsService.preview(dto);
  }

  @Post('exports')
  createExport(@Body() dto: CreateReportExportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.createExport(dto, user);
  }

  @Get('inbound-batches')
  listInboundBatchOptions(@Query() query: ListInboundBatchOptionsQueryDto) {
    return this.reportsService.listInboundBatchOptions(query);
  }

  @Get('exports')
  listExports(@Query() query: ListReportExportsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.listExports(query, user);
  }

  @Get('exports/:id')
  getExport(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getExport(id, user);
  }

  @Get('exports/:id/download')
  download(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.download(id, user);
  }
}
