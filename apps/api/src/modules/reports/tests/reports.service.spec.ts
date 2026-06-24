/* global jest */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReportsRepository } from '../reports.repository';
import { ReportsService } from '../reports.service';
import { ReportExportFormat } from '../dto/report-export-format';
import { ReportType } from '../dto/report-type';

const now = new Date('2026-06-17T00:00:00Z');
const operator = {
  id: 'user-1',
  email: 'operator@wms-scan.local',
  name: 'Report Operator',
  roles: ['ADMIN'],
  permissions: ['reports.export'],
};

const completedExport = {
  id: 'export-1',
  reportType: ReportType.INVENTORY_DETAIL,
  status: 'COMPLETED',
  requestedById: operator.id,
  filters: {
    filters: { customerId: 'customer-1' },
    fields: ['imei', 'serial'],
    format: ReportExportFormat.CSV,
    rowCount: 1,
    fileName: 'inventory_detail-export-1.csv',
    contentType: 'text/csv; charset=utf-8',
    generatedAt: now.toISOString(),
    metadata: {
      fileContent: 'IMEI,Serial\n356789012345678,',
    },
  },
  fileUrl: 'report-export://export-1/inventory_detail-export-1.csv',
  errorMessage: null,
  expiresAt: now,
  createdAt: now,
  updatedAt: now,
  requestedBy: {
    id: operator.id,
    email: operator.email,
    name: operator.name,
  },
};

const inventoryRow = {
  customer: { code: 'CUST-001' },
  warehouse: { code: 'US-LAX-01' },
  product: { sku: 'IPHONE-16-PRO-256-NAT', name: 'iPhone 16 Pro' },
  inboundBatch: { batchNo: 'INB-001' },
  outboundBoxItems: [],
  upc: '194253149189',
  imei: '356789012345678',
  serial: null,
  upsTrackingNo: '1Z999AA10123456784',
  status: 'IN_STOCK',
  receivedAt: now,
};

const outboundRow = {
  outboundBox: {
    boxNo: 'BOX-20260621-001',
    boxName: 'Apex Trading - Blue iPad',
    notes: '每箱备注：翻新 iPad 蓝色机',
    status: 'SEALED',
    customer: { code: 'CUST-001', name: 'Apple Reseller' },
    warehouse: { code: 'US-LAX-01' },
    sealedAt: now,
  },
  inventoryItem: {
    product: { sku: 'IPAD-WIFI-128-BLUE-RFB', name: 'iPad WI-FI 128GB Blue (Refurbished)' },
    upc: '194253149189',
    upsTrackingNo: '1Z999AA10123456784',
    imei: 'SH9LRL91YFC',
    serial: null,
    status: 'PACKED',
  },
  packedAt: now,
};

const outboundRowSecondBox = {
  outboundBox: {
    boxNo: 'BOX-20260621-002',
    boxName: 'Apex Trading - Silver iPad',
    notes: '第二箱备注',
    status: 'SEALED',
    customer: { code: 'CUST-001', name: 'Apple Reseller' },
    warehouse: { code: 'US-LAX-01' },
    sealedAt: now,
  },
  inventoryItem: {
    product: { sku: 'IPAD-WIFI-128-BLUE-RFB', name: 'iPad WI-FI 128GB Blue (Refurbished)' },
    upc: '194253149189',
    upsTrackingNo: '1Z999AA10123456785',
    imei: '356789012345679',
    serial: 'SN-002',
    status: 'PACKED',
  },
  packedAt: new Date('2026-06-17T00:01:00Z'),
};

const inboundRow = {
  inboundBatch: {
    id: 'batch-1',
    batchNo: 'INB-20260622-001',
    warehouse: { code: 'US-LAX-01' },
  },
  customer: { code: 'CUST-001', name: 'Apple Reseller' },
  product: { sku: 'IPHONE-16-PRO-256-NAT', name: 'iPhone 16 Pro' },
  inventoryItem: { status: 'IN_STOCK' },
  upc: '194253149189',
  imei: '356789012345678',
  serial: null,
  upsTrackingNo: '1Z999AA10123456784',
  status: 'CONFIRMED',
  scannedAt: now,
};

function createService(
  repositoryOverrides: Partial<Record<keyof ReportsRepository, jest.Mock>> = {},
) {
  const repository = {
    countRows: jest.fn().mockResolvedValue(1),
    findRows: jest.fn().mockResolvedValue([inventoryRow]),
    createExport: jest.fn().mockResolvedValue({
      ...completedExport,
      status: 'PENDING',
      filters: {},
      fileUrl: null,
      expiresAt: null,
    }),
    updateExport: jest.fn((input) =>
      Promise.resolve({
        ...completedExport,
        id: input.id,
        status: input.status,
        fileUrl: input.fileUrl ?? null,
        filters: input.filters ?? completedExport.filters,
        errorMessage: input.errorMessage ?? null,
        expiresAt: input.expiresAt ?? null,
      }),
    ),
    listExports: jest.fn().mockResolvedValue([1, [completedExport]]),
    findExportById: jest.fn().mockResolvedValue(completedExport),
    findInboundBatchOptions: jest.fn().mockResolvedValue([0, []]),
    findInboundBatchById: jest
      .fn()
      .mockResolvedValue({ id: 'batch-1', batchNo: 'INB-20260622-001' }),
    createAuditLog: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    ...repositoryOverrides,
  } as unknown as jest.Mocked<ReportsRepository>;

  return {
    repository,
    service: new ReportsService(repository),
  };
}

describe('ReportsService', () => {
  it('rejects fields outside the report whitelist', async () => {
    const { service } = createService();

    await expect(
      service.preview({
        reportType: ReportType.INVENTORY_DETAIL,
        fields: ['imei', 'passwordHash'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns preview counts and selected fields', async () => {
    const { repository, service } = createService();

    await expect(
      service.preview({
        reportType: ReportType.INVENTORY_DETAIL,
        filters: { customerId: ' customer-1 ' },
        fields: ['imei', 'serial'],
      }),
    ).resolves.toMatchObject({
      reportType: ReportType.INVENTORY_DETAIL,
      estimatedRowCount: 1,
      selectedFields: ['imei', 'serial'],
      sampleRows: [{ imei: '356789012345678', serial: '' }],
      shouldRunInBackground: false,
      filters: { customerId: 'customer-1' },
    });
    expect(repository.countRows).toHaveBeenCalledWith(ReportType.INVENTORY_DETAIL, {
      customerId: 'customer-1',
    });
    expect(repository.findRows).toHaveBeenCalledWith(
      ReportType.INVENTORY_DETAIL,
      {
        customerId: 'customer-1',
      },
      10,
    );
  });

  it('creates a completed CSV export and writes an audit log', async () => {
    const { repository, service } = createService();

    await expect(
      service.createExport(
        {
          reportType: ReportType.INVENTORY_DETAIL,
          format: ReportExportFormat.CSV,
          fields: ['imei', 'serial'],
        },
        operator,
      ),
    ).resolves.toMatchObject({
      id: 'export-1',
      status: 'COMPLETED',
      rowCount: 1,
      fileName: 'inventory_detail-export-1.csv',
    });
    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        exportId: 'export-1',
        operatorId: operator.id,
        reportType: ReportType.INVENTORY_DETAIL,
        rowCount: 1,
        format: ReportExportFormat.CSV,
      }),
    );
  });

  it('includes box notes in outbound detail downloads', async () => {
    const { service } = createService({ findRows: jest.fn().mockResolvedValue([outboundRow]) });

    await expect(
      service.preview({
        reportType: ReportType.OUTBOUND_DETAIL,
        fields: ['boxNo', 'boxNotes', 'imei'],
      }),
    ).resolves.toMatchObject({
      selectedFields: ['boxNo', 'boxNotes', 'imei'],
      sampleRows: [
        {
          boxNo: 'BOX-20260621-001',
          boxNotes: '每箱备注：翻新 iPad 蓝色机',
          imei: 'SH9LRL91YFC',
        },
      ],
    });
  });

  it('formats outbound detail Excel like the packing workbook template', async () => {
    const { repository, service } = createService({
      findRows: jest.fn().mockResolvedValue([outboundRowSecondBox, outboundRow]),
    });

    await expect(
      service.createExport(
        {
          reportType: ReportType.OUTBOUND_DETAIL,
          format: ReportExportFormat.EXCEL,
          filters: { outboundStatus: 'SEALED' },
          fields: ['boxNo', 'imei'],
        },
        operator,
      ),
    ).resolves.toMatchObject({
      fileName: 'outbound_detail-export-1.xls',
      rowCount: 2,
    });

    const completedCall = repository.updateExport.mock.calls[0];
    expect(completedCall).toBeDefined();
    const completedPayload = completedCall![0].filters as {
      contentType: string;
      metadata: { fileContent: string };
    };

    expect(completedPayload.contentType).toBe('application/vnd.ms-excel; charset=utf-8');
    expect(completedPayload.metadata.fileContent).toContain('<Worksheet ss:Name="出库信息">');
    expect(completedPayload.metadata.fileContent).toContain('<Worksheet ss:Name="SN&amp;IMEI">');
    expect(completedPayload.metadata.fileContent).toContain('<Worksheet ss:Name="各箱型号汇总">');
    expect(completedPayload.metadata.fileContent).toContain('<Worksheet ss:Name="出库详情">');
    expect(completedPayload.metadata.fileContent).toContain('第 1 箱  （1 件）');
    expect(completedPayload.metadata.fileContent).toContain('第 2 箱  （1 件）');
    expect(completedPayload.metadata.fileContent).toContain('SN-002');
    expect(completedPayload.metadata.fileContent).toContain('356789012345679');
    expect(completedPayload.metadata.fileContent).toContain('实际扫描总数：');
    expect(completedPayload.metadata.fileContent).toContain(
      '<Cell ss:StyleID="Total"><Data ss:Type="Number">2</Data></Cell>',
    );
  });

  it('names inbound detail export files with the selected batch number', async () => {
    const { service } = createService({ findRows: jest.fn().mockResolvedValue([inboundRow]) });

    await expect(
      service.createExport(
        {
          reportType: ReportType.INBOUND_DETAIL,
          format: ReportExportFormat.CSV,
          filters: { batchId: 'batch-1' },
          fields: ['batchNo', 'imei'],
        },
        operator,
      ),
    ).resolves.toMatchObject({
      fileName: 'inbound_detail-INB-20260622-001-export-1.csv',
    });
  });

  it('blocks synchronous exports above the phase-thirteen row limit', async () => {
    const rows = Array.from({ length: 5001 }, () => inventoryRow);
    const { service } = createService({ findRows: jest.fn().mockResolvedValue(rows) });

    await expect(
      service.createExport(
        {
          reportType: ReportType.INVENTORY_DETAIL,
          format: ReportExportFormat.CSV,
        },
        operator,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('prevents downloading another operator export', async () => {
    const { service } = createService({
      findExportById: jest.fn().mockResolvedValue({
        ...completedExport,
        requestedById: 'user-2',
      }),
    });

    await expect(service.download('export-1', operator)).rejects.toThrow(ForbiddenException);
  });

  it('returns stored file content for completed downloads', async () => {
    const { service } = createService();

    await expect(service.download('export-1', operator)).resolves.toMatchObject({
      id: 'export-1',
      contentType: 'text/csv; charset=utf-8',
      content: 'IMEI,Serial\n356789012345678,',
    });
  });
});
