import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReportExportStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateReportExportDto } from './dto/create-report-export.dto';
import { ListReportExportsQueryDto } from './dto/list-report-exports-query.dto';
import { PreviewReportDto } from './dto/preview-report.dto';
import { ReportExportFormat } from './dto/report-export-format';
import { ReportFilterDto } from './dto/report-filter.dto';
import { ReportType } from './dto/report-type';
import { ReportExportRecord, ReportsRepository } from './reports.repository';

type ReportColumn = {
  key: string;
  title: string;
  read: (row: unknown) => unknown;
};

type ExportMetadata = {
  filters: ReportFilterDto;
  fields: string[];
  format: ReportExportFormat;
  rowCount: number;
  fileName: string;
  contentType: string;
  fileContent: string;
  generatedAt: string;
};

const MAX_SYNC_EXPORT_ROWS = 5000;

@Injectable()
export class ReportsService {
  constructor(private readonly reportsRepository: ReportsRepository) {}

  async preview(dto: PreviewReportDto) {
    const filters = this.normalizeFilters(dto.filters);
    const fields = this.resolveFields(dto.reportType, dto.fields);
    const [estimatedRowCount, sampleRows] = await Promise.all([
      this.reportsRepository.countRows(dto.reportType, filters),
      this.reportsRepository.findRows(dto.reportType, filters, 10),
    ]);

    return {
      reportType: dto.reportType,
      estimatedRowCount,
      selectedFields: fields,
      availableFields: this.getColumns(dto.reportType).map((column) => ({
        key: column.key,
        title: column.title,
      })),
      sampleRows: this.toPreviewRows(dto.reportType, fields, sampleRows),
      shouldRunInBackground: estimatedRowCount > MAX_SYNC_EXPORT_ROWS,
      filters,
    };
  }

  async createExport(dto: CreateReportExportDto, operator: AuthenticatedUser) {
    const source = dto.sourceExportId
      ? await this.findOwnedExport(dto.sourceExportId, operator.id)
      : undefined;
    const sourceMetadata = source ? this.readMetadata(source) : undefined;
    const reportType = source ? (source.reportType as ReportType) : dto.reportType;
    const format = sourceMetadata?.format ?? dto.format;
    const filters = sourceMetadata?.filters ?? this.normalizeFilters(dto.filters);
    const fields = sourceMetadata?.fields ?? this.resolveFields(reportType, dto.fields);

    const created = await this.reportsRepository.createExport({
      reportType,
      requestedById: operator.id,
      filters: this.toStoredPayload({
        filters,
        fields,
        format,
        rowCount: 0,
        fileName: '',
        contentType: '',
        fileContent: '',
        generatedAt: new Date().toISOString(),
      }),
    });

    try {
      const rows = await this.reportsRepository.findRows(
        reportType,
        filters,
        MAX_SYNC_EXPORT_ROWS + 1,
      );
      if (rows.length > MAX_SYNC_EXPORT_ROWS) {
        throw new BadRequestException('Large reports must be handled by a background job.');
      }

      const metadata = this.buildExportMetadata({
        reportType,
        format,
        fields,
        filters,
        rows,
        exportId: created.id,
      });
      const completed = await this.reportsRepository.updateExport({
        id: created.id,
        status: ReportExportStatus.COMPLETED,
        fileUrl: `report-export://${created.id}/${metadata.fileName}`,
        filters: this.toStoredPayload(metadata),
        expiresAt: this.daysFromNow(7),
      });

      await this.reportsRepository.createAuditLog({
        exportId: completed.id,
        operatorId: operator.id,
        reportType,
        rowCount: metadata.rowCount,
        format,
      });

      return this.toExportResponse(completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Report export failed.';
      const failed = await this.reportsRepository.updateExport({
        id: created.id,
        status: ReportExportStatus.FAILED,
        errorMessage: message,
      });
      if (error instanceof BadRequestException) {
        throw error;
      }
      return this.toExportResponse(failed);
    }
  }

  async listExports(query: ListReportExportsQueryDto, operator: AuthenticatedUser) {
    const [total, exports] = await this.reportsRepository.listExports({
      requestedById: operator.id,
      reportType: query.reportType,
      status: query.status,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return {
      items: exports.map((item) => this.toExportResponse(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getExport(id: string, operator: AuthenticatedUser) {
    return this.toExportResponse(await this.findOwnedExport(id, operator.id));
  }

  async download(id: string, operator: AuthenticatedUser) {
    const reportExport = await this.findOwnedExport(id, operator.id);
    if (reportExport.status !== ReportExportStatus.COMPLETED) {
      throw new BadRequestException('Only completed report exports can be downloaded.');
    }

    const metadata = this.readMetadata(reportExport);
    if (!metadata.fileContent) {
      throw new NotFoundException('Report export file content was not found.');
    }

    return {
      id: reportExport.id,
      reportType: reportExport.reportType,
      fileName: metadata.fileName,
      contentType: metadata.contentType,
      rowCount: metadata.rowCount,
      content: metadata.fileContent,
      expiresAt: reportExport.expiresAt,
    };
  }

  private async findOwnedExport(id: string, operatorId: string) {
    const reportExport = await this.reportsRepository.findExportById(id);
    if (!reportExport) {
      throw new NotFoundException('Report export not found.');
    }
    if (reportExport.requestedById !== operatorId) {
      throw new ForbiddenException('Report export belongs to another user.');
    }
    return reportExport;
  }

  private buildExportMetadata(input: {
    reportType: ReportType;
    format: ReportExportFormat;
    fields: string[];
    filters: ReportFilterDto;
    rows: unknown[];
    exportId: string;
  }): ExportMetadata {
    const columns = this.getSelectedColumns(input.reportType, input.fields);
    const content =
      input.format === ReportExportFormat.CSV
        ? this.toCsv(columns, input.rows)
        : this.toExcelXml(columns, input.rows);
    const extension = input.format === ReportExportFormat.CSV ? 'csv' : 'xls';
    const contentType =
      input.format === ReportExportFormat.CSV
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.ms-excel; charset=utf-8';

    return {
      filters: input.filters,
      fields: input.fields,
      format: input.format,
      rowCount: input.rows.length,
      fileName: `${input.reportType.toLowerCase()}-${input.exportId}.${extension}`,
      contentType,
      fileContent: content,
      generatedAt: new Date().toISOString(),
    };
  }

  private toCsv(columns: ReportColumn[], rows: unknown[]) {
    const lines = [
      columns.map((column) => this.escapeCsvCell(column.title)).join(','),
      ...rows.map((row) =>
        columns.map((column) => this.escapeCsvCell(this.formatValue(column.read(row)))).join(','),
      ),
    ];
    return lines.join('\n');
  }

  private toExcelXml(columns: ReportColumn[], rows: unknown[]) {
    const header = columns
      .map((column) => `<Cell><Data ss:Type="String">${this.escapeXml(column.title)}</Data></Cell>`)
      .join('');
    const body = rows
      .map((row) => {
        const cells = columns
          .map((column) => {
            const value = this.formatValue(column.read(row));
            return `<Cell><Data ss:Type="String">${this.escapeXml(value)}</Data></Cell>`;
          })
          .join('');
        return `<Row>${cells}</Row>`;
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Report">
  <Table>
   <Row>${header}</Row>
   ${body}
  </Table>
 </Worksheet>
</Workbook>`;
  }

  private resolveFields(reportType: ReportType, requestedFields?: string[]) {
    const columns = this.getColumns(reportType);
    const allowed = new Set(columns.map((column) => column.key));
    const fields = requestedFields?.length
      ? [...new Set(requestedFields.map((field) => field.trim()).filter(Boolean))]
      : columns.map((column) => column.key);
    const rejected = fields.filter((field) => !allowed.has(field));
    if (rejected.length) {
      throw new BadRequestException(`Unsupported report fields: ${rejected.join(', ')}.`);
    }
    return fields;
  }

  private getSelectedColumns(reportType: ReportType, fields: string[]) {
    const byKey = new Map(this.getColumns(reportType).map((column) => [column.key, column]));
    return fields.map((field) => {
      const column = byKey.get(field);
      if (!column) {
        throw new BadRequestException(`Unsupported report field: ${field}.`);
      }
      return column;
    });
  }

  private toPreviewRows(reportType: ReportType, fields: string[], rows: unknown[]) {
    const columns = this.getSelectedColumns(reportType, fields);

    return rows.map((row) =>
      Object.fromEntries(columns.map((column) => [column.key, this.formatValue(column.read(row))])),
    );
  }

  private getColumns(reportType: ReportType): ReportColumn[] {
    const field = (key: string, title: string, ...path: Array<string | number>): ReportColumn => ({
      key,
      title,
      read: (row) => this.readPath(row, ...path),
    });
    const columns: Record<ReportType, ReportColumn[]> = {
      [ReportType.INBOUND_DETAIL]: [
        field('batchNo', 'Inbound Batch', 'inboundBatch', 'batchNo'),
        field('customerCode', 'Customer Code', 'customer', 'code'),
        field('customerName', 'Customer Name', 'customer', 'name'),
        field('warehouseCode', 'Warehouse Code', 'inboundBatch', 'warehouse', 'code'),
        field('sku', 'SKU', 'product', 'sku'),
        field('productName', 'Product Name', 'product', 'name'),
        field('upc', 'UPC', 'upc'),
        field('imei', 'IMEI', 'imei'),
        field('serial', 'Serial', 'serial'),
        field('upsTrackingNo', 'UPS Tracking No', 'upsTrackingNo'),
        field('status', 'Inbound Status', 'status'),
        field('inventoryStatus', 'Inventory Status', 'inventoryItem', 'status'),
        field('scannedAt', 'Scanned At', 'scannedAt'),
      ],
      [ReportType.OUTBOUND_DETAIL]: [
        field('boxNo', 'Box No', 'outboundBox', 'boxNo'),
        field('boxStatus', 'Box Status', 'outboundBox', 'status'),
        field('customerCode', 'Customer Code', 'outboundBox', 'customer', 'code'),
        field('warehouseCode', 'Warehouse Code', 'outboundBox', 'warehouse', 'code'),
        field('sku', 'SKU', 'inventoryItem', 'product', 'sku'),
        field('upc', 'UPC', 'inventoryItem', 'upc'),
        field('imei', 'IMEI', 'inventoryItem', 'imei'),
        field('serial', 'Serial', 'inventoryItem', 'serial'),
        field('inventoryStatus', 'Inventory Status', 'inventoryItem', 'status'),
        field('packedAt', 'Packed At', 'packedAt'),
        field('sealedAt', 'Sealed At', 'outboundBox', 'sealedAt'),
      ],
      [ReportType.INVENTORY_DETAIL]: [
        field('customerCode', 'Customer Code', 'customer', 'code'),
        field('warehouseCode', 'Warehouse Code', 'warehouse', 'code'),
        field('sku', 'SKU', 'product', 'sku'),
        field('productName', 'Product Name', 'product', 'name'),
        field('upc', 'UPC', 'upc'),
        field('imei', 'IMEI', 'imei'),
        field('serial', 'Serial', 'serial'),
        field('upsTrackingNo', 'UPS Tracking No', 'upsTrackingNo'),
        field('status', 'Inventory Status', 'status'),
        field('batchNo', 'Inbound Batch', 'inboundBatch', 'batchNo'),
        field('latestBoxNo', 'Latest Box No', 'outboundBoxItems', 0, 'outboundBox', 'boxNo'),
        field('receivedAt', 'Received At', 'receivedAt'),
      ],
      [ReportType.EXCEPTION_DETAIL]: [
        field('type', 'Exception Type', 'type'),
        field('status', 'Exception Status', 'status'),
        field('customerCode', 'Customer Code', 'customer', 'code'),
        field('warehouseCode', 'Warehouse Code', 'warehouse', 'code'),
        field('sku', 'SKU', 'product', 'sku'),
        field('rawValue', 'Raw Value', 'rawValue'),
        field('upc', 'UPC', 'upc'),
        field('imei', 'IMEI', 'imei'),
        field('serial', 'Serial', 'serial'),
        field('resolutionNote', 'Resolution Note', 'resolutionNote'),
        field('createdAt', 'Created At', 'createdAt'),
        field('resolvedAt', 'Resolved At', 'resolvedAt'),
      ],
      [ReportType.CUSTOMER_CHANGE_LOG]: [
        field('oldCustomerCode', 'Old Customer Code', 'oldCustomer', 'code'),
        field('newCustomerCode', 'New Customer Code', 'newCustomer', 'code'),
        field('operatorEmail', 'Operator Email', 'operator', 'email'),
        field('affectedCount', 'Affected Count', 'affectedCount'),
        field('reason', 'Reason', 'reason'),
        field('createdAt', 'Created At', 'createdAt'),
      ],
      [ReportType.AUDIT_LOG]: [
        field('action', 'Action', 'action'),
        field('resourceType', 'Resource Type', 'resourceType'),
        field('resourceId', 'Resource ID', 'resourceId'),
        field('operatorEmail', 'Operator Email', 'operator', 'email'),
        field('requestId', 'Request ID', 'requestId'),
        field('createdAt', 'Created At', 'createdAt'),
      ],
    };
    return columns[reportType];
  }

  private readPath(row: unknown, ...path: Array<string | number>) {
    let current = row;
    for (const key of path) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof key === 'number') {
        if (!Array.isArray(current)) {
          return undefined;
        }
        current = current[key];
        continue;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  private normalizeFilters(filters?: ReportFilterDto): ReportFilterDto {
    const normalized: ReportFilterDto = {};
    for (const [key, value] of Object.entries(filters ?? {})) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          normalized[key as keyof ReportFilterDto] = trimmed as never;
        }
      } else if (value !== undefined && value !== null) {
        normalized[key as keyof ReportFilterDto] = value as never;
      }
    }
    return normalized;
  }

  private toExportResponse(reportExport: ReportExportRecord) {
    const metadata = this.readMetadata(reportExport, { allowEmpty: true });
    return {
      id: reportExport.id,
      reportType: reportExport.reportType,
      status: reportExport.status,
      requestedBy: reportExport.requestedBy,
      filters: metadata.filters,
      fields: metadata.fields,
      format: metadata.format,
      rowCount: metadata.rowCount,
      fileName: metadata.fileName || null,
      fileUrl: reportExport.fileUrl,
      errorMessage: reportExport.errorMessage,
      expiresAt: reportExport.expiresAt,
      createdAt: reportExport.createdAt,
      updatedAt: reportExport.updatedAt,
    };
  }

  private readMetadata(
    reportExport: ReportExportRecord,
    options: { allowEmpty?: boolean } = {},
  ): ExportMetadata {
    const raw = reportExport.filters as Prisma.JsonObject;
    const metadata = raw?.metadata as Partial<ExportMetadata> | undefined;
    if (!metadata && !options.allowEmpty) {
      throw new NotFoundException('Report export metadata was not found.');
    }

    return {
      filters: (raw?.filters as ReportFilterDto | undefined) ?? {},
      fields: Array.isArray(raw?.fields) ? (raw.fields as string[]) : [],
      format: (raw?.format as ReportExportFormat | undefined) ?? ReportExportFormat.CSV,
      rowCount: typeof raw?.rowCount === 'number' ? raw.rowCount : 0,
      fileName: typeof raw?.fileName === 'string' ? raw.fileName : '',
      contentType: typeof raw?.contentType === 'string' ? raw.contentType : '',
      fileContent: typeof metadata?.fileContent === 'string' ? metadata.fileContent : '',
      generatedAt: typeof raw?.generatedAt === 'string' ? raw.generatedAt : '',
    };
  }

  private toStoredPayload(metadata: ExportMetadata): Prisma.InputJsonValue {
    return {
      filters: metadata.filters as Prisma.InputJsonObject,
      fields: metadata.fields,
      format: metadata.format,
      rowCount: metadata.rowCount,
      fileName: metadata.fileName,
      contentType: metadata.contentType,
      generatedAt: metadata.generatedAt,
      metadata: {
        fileContent: metadata.fileContent,
      },
    };
  }

  private escapeCsvCell(value: string) {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private formatValue(value: unknown) {
    if (value === null || value === undefined) {
      return '';
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private daysFromNow(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }
}
