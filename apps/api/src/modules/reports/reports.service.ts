import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReportExportStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateReportExportDto } from './dto/create-report-export.dto';
import { ListInboundBatchOptionsQueryDto } from './dto/list-inbound-batch-options-query.dto';
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

type OutboundDetailExportRow = {
  boxNo: string;
  boxName: string;
  shippingTrackingNo: string;
  customerCode: string;
  customerName: string;
  warehouseCode: string;
  productName: string;
  upc: string;
  imei: string;
  serial: string;
  packedAt: Date | null;
  sealedAt: Date | null;
};

type OutboundBoxExportGroup = {
  boxNo: string;
  boxName: string;
  shippingTrackingNo: string;
  rows: OutboundDetailExportRow[];
};

type ProductSummary = {
  upc: string;
  productName: string;
  count: number;
};

type InventoryDetailSummaryRow = {
  upsTrackingNo: string;
  upc: string;
  imei: string;
  productName: string;
  quantity: number | string;
};

const MAX_SYNC_EXPORT_ROWS = 5000;

@Injectable()
export class ReportsService {
  constructor(private readonly reportsRepository: ReportsRepository) {}

  async listInboundBatchOptions(query: ListInboundBatchOptionsQueryDto) {
    const [total, batches] = await this.reportsRepository.findInboundBatchOptions({
      customerId: this.trimOptional(query.customerId),
      search: this.trimOptional(query.search),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return {
      items: batches.map((batch) => ({
        id: batch.id,
        batchNo: batch.batchNo,
        label: `${batch.batchNo} / ${batch.customer.code} / ${batch._count.inboundItems} 行`,
        customer: batch.customer,
        warehouse: batch.warehouse,
        rowCount: batch._count.inboundItems,
        confirmedAt: batch.confirmedAt,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async preview(dto: PreviewReportDto) {
    const filters = this.normalizeFilters(dto.filters);
    const fields = this.resolveFields(dto.reportType, dto.fields);
    const previewTake =
      dto.reportType === ReportType.INVENTORY_DETAIL ? MAX_SYNC_EXPORT_ROWS + 1 : 10;
    const [rawEstimatedRowCount, rawSampleRows] = await Promise.all([
      this.reportsRepository.countRows(dto.reportType, filters),
      this.reportsRepository.findRows(dto.reportType, filters, previewTake),
    ]);
    const normalizedRows = this.normalizeRowsForReport(dto.reportType, rawSampleRows);
    const estimatedRowCount =
      dto.reportType === ReportType.INVENTORY_DETAIL
        ? normalizedRows.length
        : rawEstimatedRowCount;

    return {
      reportType: dto.reportType,
      estimatedRowCount,
      selectedFields: fields,
      availableFields: this.getColumns(dto.reportType).map((column) => ({
        key: column.key,
        title: column.title,
      })),
      sampleRows: this.toPreviewRows(dto.reportType, fields, normalizedRows.slice(0, 10)),
      shouldRunInBackground: rawEstimatedRowCount > MAX_SYNC_EXPORT_ROWS,
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

      const normalizedRows = this.normalizeRowsForReport(reportType, rows);
      const batchFileNamePart = await this.resolveExportFileNamePart(reportType, filters, rows);
      const metadata = this.buildExportMetadata({
        reportType,
        format,
        fields,
        filters,
        rows: normalizedRows,
        exportId: created.id,
        batchFileNamePart,
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
    batchFileNamePart?: string;
  }): ExportMetadata {
    const columns = this.getSelectedColumns(input.reportType, input.fields);
    const content =
      input.format === ReportExportFormat.CSV
        ? this.toCsv(columns, input.rows)
        : input.reportType === ReportType.OUTBOUND_DETAIL
          ? this.toOutboundDetailExcelXml(input.rows, input.exportId)
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
      fileName:
        [input.reportType.toLowerCase(), input.batchFileNamePart, input.exportId]
          .filter(Boolean)
          .join('-') + `.${extension}`,
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

  private toOutboundDetailExcelXml(rows: unknown[], exportId: string) {
    const detailRows = this.toOutboundDetailRows(rows);
    const boxGroups = this.groupOutboundRowsByBox(detailRows);
    const outboundDate = this.resolveOutboundDate(detailRows);
    const outboundId = `OUT-${outboundDate.replace(/-/g, '')}-${detailRows.length}`;
    const customerName = this.joinUnique(
      detailRows.map((row) => row.customerName || row.customerCode).filter(Boolean),
    );
    const productSummaries = this.summarizeProducts(detailRows);

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 ${this.outboundWorkbookStyles()}
 ${this.outboundInfoWorksheet({
   outboundId,
   customerName,
   outboundDate,
   totalCount: detailRows.length,
   productSummaries,
 })}
 ${this.outboundSnImeiWorksheet({ outboundId, boxGroups })}
 ${this.outboundBoxSummaryWorksheet(boxGroups)}
 ${this.outboundScannedSummaryWorksheet({
   outboundId,
   customerName,
   outboundDate,
   boxCount: boxGroups.length,
   totalCount: detailRows.length,
   productSummaries,
 })}
 <Worksheet ss:Name="_metadata">
  <Table>
   <Row>${this.excelCell('Export ID', 'Header')}</Row>
   <Row>${this.excelCell(exportId)}</Row>
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Visible>SheetHidden</Visible>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;
  }

  private outboundWorkbookStyles() {
    return `<Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="Title">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1D4ED8" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="SheetTitle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1D4ED8" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="InfoLabel">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
   <Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/>
   <Borders>${this.thinBorders()}</Borders>
  </Style>
  <Style ss:ID="InfoValue">
   <Alignment ss:Vertical="Center"/>
   <Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/>
   <Borders>${this.thinBorders()}</Borders>
  </Style>
  <Style ss:ID="BoxTitle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E3A5F" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
   <Interior ss:Color="#BFDBFE" ss:Pattern="Solid"/>
   <Borders>${this.thinBorders()}</Borders>
  </Style>
  <Style ss:ID="Cell">
   <Alignment ss:Vertical="Center"/>
   <Borders>${this.thinBorders()}</Borders>
  </Style>
  <Style ss:ID="CenterCell">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>${this.thinBorders()}</Borders>
  </Style>
  <Style ss:ID="Total">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
   <Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/>
   <Borders>${this.thinBorders()}</Borders>
  </Style>
 </Styles>`;
  }

  private outboundInfoWorksheet(input: {
    outboundId: string;
    customerName: string;
    outboundDate: string;
    totalCount: number;
    productSummaries: ProductSummary[];
  }) {
    const rows = [
      this.excelRow([this.excelCell('出库记录详情', 'Title', { mergeAcross: 3 })], 28),
      this.infoRow('出库ID：', input.outboundId, 2),
      this.infoRow('销售客户：', input.customerName, 2),
      this.infoRow('目的地：', '', 2),
      this.infoRow('出库日期：', input.outboundDate, 2),
      this.infoRow('出库总数量：', input.totalCount, 2),
      this.excelRow([]),
      this.excelRow([
        this.excelCell('UPC', 'Header'),
        this.excelCell('型号', 'Header'),
        this.excelCell('数量', 'Header'),
      ]),
      ...input.productSummaries.map((item) =>
        this.excelRow([
          this.excelCell(item.upc, 'Cell'),
          this.excelCell(item.productName, 'Cell'),
          this.excelCell(item.count, 'CenterCell', { type: 'Number' }),
        ]),
      ),
      this.excelRow([
        this.excelCell('合计', 'Total', { mergeAcross: 1 }),
        this.excelCell(input.totalCount, 'Total', { type: 'Number' }),
      ]),
    ];

    return `<Worksheet ss:Name="出库信息">
  <Table>
   <Column ss:Width="117"/>
   <Column ss:Width="243"/>
   <Column ss:Width="145"/>
   <Column ss:Width="75"/>
   ${rows.join('\n   ')}
  </Table>
 </Worksheet>`;
  }

  private outboundSnImeiWorksheet(input: {
    outboundId: string;
    boxGroups: OutboundBoxExportGroup[];
  }) {
    const rows = [
      this.excelRow(
        [
          this.excelCell(`SN & IMEI 明细  -  ${input.outboundId}`, 'SheetTitle', {
            mergeAcross: 3,
          }),
        ],
        25,
      ),
    ];

    input.boxGroups.forEach((box, boxIndex) => {
      if (boxIndex > 0) {
        rows.push(this.excelRow([]));
      }
      rows.push(
        this.excelRow(
          [
            this.excelCell(`第 ${boxIndex + 1} 箱  （${box.rows.length} 件）`, 'BoxTitle', {
              mergeAcross: 3,
            }),
          ],
          22,
        ),
        this.infoRow('上传单号：', box.shippingTrackingNo || '-', 2),
      );
      rows.push(
        this.excelRow([
          this.excelCell('序号', 'Header'),
          this.excelCell('UPC', 'Header'),
          this.excelCell('SN', 'Header'),
          this.excelCell('IMEI', 'Header'),
        ]),
      );
      box.rows.forEach((row, rowIndex) => {
        rows.push(
          this.excelRow([
            this.excelCell(rowIndex + 1, 'CenterCell', { type: 'Number' }),
            this.excelCell(row.upc, 'Cell'),
            this.excelCell(row.serial, 'Cell'),
            this.excelCell(row.imei, 'Cell'),
          ]),
        );
      });
    });

    return `<Worksheet ss:Name="SN&amp;IMEI">
  <Table>
   <Column ss:Width="54"/>
   <Column ss:Width="145"/>
   <Column ss:Width="159"/>
   <Column ss:Width="159"/>
   ${rows.join('\n   ')}
  </Table>
 </Worksheet>`;
  }

  private outboundBoxSummaryWorksheet(boxGroups: OutboundBoxExportGroup[]) {
    const rows = [
      this.excelRow([this.excelCell('各箱型号汇总', 'SheetTitle', { mergeAcross: 2 })], 25),
    ];

    boxGroups.forEach((box, boxIndex) => {
      if (boxIndex > 0) {
        rows.push(this.excelRow([]), this.excelRow([]));
      }
      rows.push(
        this.excelRow(
          [
            this.excelCell(
              `第 ${boxIndex + 1} 箱  上传单号：${box.shippingTrackingNo || '-'}`,
              'BoxTitle',
              { mergeAcross: 2 },
            ),
          ],
          22,
        ),
      );
      rows.push(
        this.excelRow([
          this.excelCell('UPC', 'Header'),
          this.excelCell('型号', 'Header'),
          this.excelCell('数量', 'Header'),
        ]),
      );
      const summaries = this.summarizeProducts(box.rows);
      summaries.forEach((item) => {
        rows.push(
          this.excelRow([
            this.excelCell(item.upc, 'Cell'),
            this.excelCell(item.productName, 'Cell'),
            this.excelCell(item.count, 'CenterCell', { type: 'Number' }),
          ]),
        );
      });
      rows.push(
        this.excelRow([
          this.excelCell(`第 ${boxIndex + 1} 箱  合计`, 'Total', { mergeAcross: 1 }),
          this.excelCell(box.rows.length, 'Total', { type: 'Number' }),
        ]),
      );
    });

    return `<Worksheet ss:Name="各箱型号汇总">
  <Table>
   <Column ss:Width="117"/>
   <Column ss:Width="243"/>
   <Column ss:Width="75"/>
   ${rows.join('\n   ')}
  </Table>
 </Worksheet>`;
  }

  private outboundScannedSummaryWorksheet(input: {
    outboundId: string;
    customerName: string;
    outboundDate: string;
    boxCount: number;
    totalCount: number;
    productSummaries: ProductSummary[];
  }) {
    const rows = [
      this.excelRow(
        [this.excelCell('出库详情（实际扫描汇总）', 'SheetTitle', { mergeAcross: 2 })],
        25,
      ),
      this.infoRow('出库ID：', input.outboundId, 1),
      this.infoRow('销售客户：', input.customerName, 1),
      this.infoRow('出库日期：', input.outboundDate, 1),
      this.infoRow('箱数：', input.boxCount, 1),
      this.infoRow('实际扫描总数：', input.totalCount, 1),
      this.excelRow([]),
      this.excelRow([
        this.excelCell('UPC', 'Header'),
        this.excelCell('型号', 'Header'),
        this.excelCell('数量', 'Header'),
      ]),
      ...input.productSummaries.map((item) =>
        this.excelRow([
          this.excelCell(item.upc, 'Cell'),
          this.excelCell(item.productName, 'Cell'),
          this.excelCell(item.count, 'CenterCell', { type: 'Number' }),
        ]),
      ),
      this.excelRow([
        this.excelCell('合计', 'Total', { mergeAcross: 1 }),
        this.excelCell(input.totalCount, 'Total', { type: 'Number' }),
      ]),
    ];

    return `<Worksheet ss:Name="出库详情">
  <Table>
   <Column ss:Width="131"/>
   <Column ss:Width="257"/>
   <Column ss:Width="89"/>
   ${rows.join('\n   ')}
  </Table>
 </Worksheet>`;
  }

  private infoRow(label: string, value: string | number, mergeAcross: number) {
    return this.excelRow([
      this.excelCell(label, 'InfoLabel'),
      this.excelCell(value, 'InfoValue', { mergeAcross }),
    ]);
  }

  private excelRow(cells: string[], height?: number) {
    const heightAttr = height ? ` ss:Height="${height}"` : '';
    return `<Row${heightAttr}>${cells.join('')}</Row>`;
  }

  private excelCell(
    value: string | number,
    styleId = 'Cell',
    options: { type?: 'String' | 'Number'; mergeAcross?: number } = {},
  ) {
    const type = options.type ?? (typeof value === 'number' ? 'Number' : 'String');
    const mergeAttr = options.mergeAcross ? ` ss:MergeAcross="${options.mergeAcross}"` : '';
    return `<Cell ss:StyleID="${styleId}"${mergeAttr}><Data ss:Type="${type}">${this.escapeXml(
      String(value),
    )}</Data></Cell>`;
  }

  private thinBorders() {
    return `<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>`;
  }

  private toOutboundDetailRows(rows: unknown[]): OutboundDetailExportRow[] {
    return rows.map((row) => ({
      boxNo: this.formatValue(this.readPath(row, 'outboundBox', 'boxNo')),
      boxName: this.formatValue(this.readPath(row, 'outboundBox', 'boxName')),
      shippingTrackingNo: this.formatValue(
        this.readPath(row, 'outboundBox', 'shippingTrackingNo'),
      ),
      customerCode: this.formatValue(this.readPath(row, 'outboundBox', 'customer', 'code')),
      customerName: this.formatValue(this.readPath(row, 'outboundBox', 'customer', 'name')),
      warehouseCode: this.formatValue(this.readPath(row, 'outboundBox', 'warehouse', 'code')),
      productName: this.formatValue(this.readPath(row, 'inventoryItem', 'product', 'name')),
      upc: this.formatValue(this.readPath(row, 'inventoryItem', 'upc')),
      imei: this.formatValue(this.readPath(row, 'inventoryItem', 'imei')),
      serial: this.formatValue(this.readPath(row, 'inventoryItem', 'serial')),
      packedAt: this.toDateOrNull(this.readPath(row, 'packedAt')),
      sealedAt: this.toDateOrNull(this.readPath(row, 'outboundBox', 'sealedAt')),
    }));
  }

  private groupOutboundRowsByBox(rows: OutboundDetailExportRow[]): OutboundBoxExportGroup[] {
    const groups = new Map<string, OutboundBoxExportGroup>();
    [...rows]
      .sort((left, right) => {
        const boxCompare = left.boxNo.localeCompare(right.boxNo);
        if (boxCompare !== 0) {
          return boxCompare;
        }
        return (left.packedAt?.getTime() ?? 0) - (right.packedAt?.getTime() ?? 0);
      })
      .forEach((row) => {
        const key = row.boxNo || row.boxName || '未命名箱子';
        const group = groups.get(key) ?? {
          boxNo: row.boxNo,
          boxName: row.boxName,
          shippingTrackingNo: row.shippingTrackingNo,
          rows: [],
        };
        group.rows.push(row);
        groups.set(key, group);
      });
    return [...groups.values()];
  }

  private summarizeProducts(rows: OutboundDetailExportRow[]): ProductSummary[] {
    const summaries = new Map<string, ProductSummary>();
    rows.forEach((row) => {
      const key = `${row.upc}::${row.productName}`;
      const current = summaries.get(key) ?? {
        upc: row.upc,
        productName: row.productName,
        count: 0,
      };
      current.count += 1;
      summaries.set(key, current);
    });
    return [...summaries.values()].sort((left, right) => left.upc.localeCompare(right.upc));
  }

  private resolveOutboundDate(rows: OutboundDetailExportRow[]) {
    const timestamps = rows
      .flatMap((row) => [row.sealedAt, row.packedAt])
      .filter((value): value is Date => value instanceof Date)
      .map((value) => value.getTime());
    const date = timestamps.length ? new Date(Math.max(...timestamps)) : new Date();
    return date.toISOString().slice(0, 10);
  }

  private joinUnique(values: string[]) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].join(' / ');
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

  private normalizeRowsForReport(reportType: ReportType, rows: unknown[]) {
    if (reportType !== ReportType.INVENTORY_DETAIL) {
      return rows;
    }
    return this.toInventoryDetailSummaryRows(rows);
  }

  private toInventoryDetailSummaryRows(rows: unknown[]): InventoryDetailSummaryRow[] {
    const groups = new Map<
      string,
      {
        upc: string;
        productName: string;
        trackingNumbers: Set<string>;
        identities: Set<string>;
        quantity: number;
      }
    >();

    for (const row of rows) {
      const upc = this.formatValue(this.readPath(row, 'upc'));
      const productName = this.formatValue(
        this.readPath(row, 'product', 'name') || this.readPath(row, 'productName'),
      );
      const trackingNo = this.formatValue(this.readPath(row, 'upsTrackingNo'));
      const key = `${trackingNo}::${upc}::${productName}`;
      const group =
        groups.get(key) ??
        ({
          upc,
          productName,
          trackingNumbers: new Set<string>(),
          identities: new Set<string>(),
          quantity: 0,
        } satisfies {
          upc: string;
          productName: string;
          trackingNumbers: Set<string>;
          identities: Set<string>;
          quantity: number;
        });

      if (trackingNo) {
        group.trackingNumbers.add(trackingNo);
      }
      const identity = this.formatValue(this.readPath(row, 'imei') || this.readPath(row, 'serial'));
      if (identity) {
        group.identities.add(identity);
      }
      group.quantity += this.readQuantity(row);
      groups.set(key, group);
    }

    return Array.from(groups.values()).flatMap((group) => {
      const identities = this.toCleanValues(group.identities);
      const shouldExpand = group.quantity > 1 || identities.length > 1;
      const summaryRow = {
        upsTrackingNo: this.formatAggregatedValues(group.trackingNumbers),
        upc: group.upc,
        imei: shouldExpand
          ? this.formatInventorySummaryIdentity(group.quantity, identities.length)
          : (identities[0] ?? ''),
        productName: group.productName,
        quantity: group.quantity,
      };

      if (!shouldExpand) {
        return [summaryRow];
      }

      return [
        summaryRow,
        ...identities.map((identity) => ({
          upsTrackingNo: '',
          upc: '',
          imei: identity,
          productName: '',
          quantity: '',
        })),
      ];
    });
  }

  private formatInventorySummaryIdentity(quantity: number, identityCount: number) {
    if (quantity === identityCount) {
      return `共 ${quantity} 个 IMEI`;
    }
    return `共 ${quantity} 台，已列 ${identityCount} 个 IMEI`;
  }

  private formatAggregatedValues(values: Set<string>) {
    return this.toCleanValues(values).join(' / ');
  }

  private toCleanValues(values: Set<string>) {
    return Array.from(values)
      .map((value) => value.trim())
      .filter(Boolean);
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
    const computedField = (
      key: string,
      title: string,
      read: (row: unknown) => unknown,
    ): ReportColumn => ({
      key,
      title,
      read,
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
        field('boxName', 'Box Name', 'outboundBox', 'boxName'),
        field('shippingTrackingNo', 'Uploaded Tracking No', 'outboundBox', 'shippingTrackingNo'),
        field('boxNotes', 'Box Notes', 'outboundBox', 'notes'),
        field('boxStatus', 'Box Status', 'outboundBox', 'status'),
        field('customerCode', 'Customer Code', 'outboundBox', 'customer', 'code'),
        field('customerName', 'Customer Name', 'outboundBox', 'customer', 'name'),
        field('warehouseCode', 'Warehouse Code', 'outboundBox', 'warehouse', 'code'),
        field('sku', 'SKU', 'inventoryItem', 'product', 'sku'),
        field('productName', 'Product Name', 'inventoryItem', 'product', 'name'),
        field('upc', 'UPC', 'inventoryItem', 'upc'),
        field('upsTrackingNo', 'UPS Tracking No', 'inventoryItem', 'upsTrackingNo'),
        field('imei', 'IMEI', 'inventoryItem', 'imei'),
        field('serial', 'Serial', 'inventoryItem', 'serial'),
        field('inventoryStatus', 'Inventory Status', 'inventoryItem', 'status'),
        field('packedAt', 'Packed At', 'packedAt'),
        field('sealedAt', 'Sealed At', 'outboundBox', 'sealedAt'),
      ],
      [ReportType.INVENTORY_DETAIL]: [
        field('upsTrackingNo', '单号', 'upsTrackingNo'),
        field('upc', 'UPC', 'upc'),
        computedField(
          'imei',
          'IMEI',
          (row) => this.readPath(row, 'imei') || this.readPath(row, 'serial'),
        ),
        computedField(
          'productName',
          '商品名称',
          (row) => this.readPath(row, 'product', 'name') || this.readPath(row, 'productName'),
        ),
        computedField(
          'quantity',
          '数量',
          (row) => this.readPath(row, 'quantity') ?? this.readQuantity(row),
        ),
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

  private async resolveExportFileNamePart(
    reportType: ReportType,
    filters: ReportFilterDto,
    rows: unknown[],
  ) {
    if (reportType === ReportType.OUTBOUND_DETAIL && filters.boxNo) {
      return this.sanitizeFileNamePart(filters.boxNo);
    }

    if (reportType !== ReportType.INBOUND_DETAIL || !filters.batchId) {
      return undefined;
    }

    const firstRowBatchNo = this.readPath(rows[0], 'inboundBatch', 'batchNo');
    if (typeof firstRowBatchNo === 'string' && firstRowBatchNo.trim()) {
      return this.sanitizeFileNamePart(firstRowBatchNo);
    }

    const batch = await this.reportsRepository.findInboundBatchById(filters.batchId);
    return batch?.batchNo ? this.sanitizeFileNamePart(batch.batchNo) : undefined;
  }

  private sanitizeFileNamePart(value: string) {
    return value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private trimOptional(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed || undefined;
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

  private readQuantity(row: unknown) {
    const directQuantity = this.readNumericPath(row, 'quantity');
    if (directQuantity !== undefined) {
      return directQuantity;
    }
    const directCount = this.readNumericPath(row, 'count');
    if (directCount !== undefined) {
      return directCount;
    }
    const allCount = this.readNumericPath(row, '_count', '_all');
    if (allCount !== undefined) {
      return allCount;
    }
    return 1;
  }

  private readNumericPath(row: unknown, ...path: Array<string | number>) {
    const value = this.readPath(row, ...path);
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

  private toDateOrNull(value: unknown) {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  private daysFromNow(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }
}
