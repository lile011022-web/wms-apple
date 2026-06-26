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
    fields: ['upsTrackingNo', 'upc', 'imei', 'productName', 'quantity'],
    format: ReportExportFormat.CSV,
    rowCount: 1,
    fileName: 'inventory_detail-export-1.csv',
    contentType: 'text/csv; charset=utf-8',
    generatedAt: now.toISOString(),
    metadata: {
      fileContent:
        '单号,UPC,IMEI,商品名称,数量\n1Z999AA10123456784,194253149189,356789012345678,iPhone 16 Pro,3',
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
  quantity: 3,
  status: 'IN_STOCK',
  receivedAt: now,
};

const inventoryRowSameProduct = {
  ...inventoryRow,
  imei: '356789012345679',
  upsTrackingNo: '1Z999AA10123456784',
  quantity: 2,
};

const inventoryRowSameProductDifferentTracking = {
  ...inventoryRow,
  imei: '356789012345680',
  upsTrackingNo: '1Z999AA10123456785',
  quantity: 4,
};

const outboundRow = {
  outboundBox: {
    boxNo: 'BOX-20260621-001',
    boxName: 'Apex Trading - Blue iPad',
    shippingTrackingNo: 'UPLOAD-TRACK-001',
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
    shippingTrackingNo: 'UPLOAD-TRACK-002',
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
    findRows: jest
      .fn()
      .mockResolvedValue([
        inventoryRow,
        inventoryRowSameProduct,
        inventoryRowSameProductDifferentTracking,
      ]),
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
        fields: ['upsTrackingNo', 'upc', 'imei', 'productName', 'quantity'],
      }),
    ).resolves.toMatchObject({
      reportType: ReportType.INVENTORY_DETAIL,
      estimatedRowCount: 5,
      selectedFields: ['upsTrackingNo', 'upc', 'imei', 'productName', 'quantity'],
      availableFields: [
        { key: 'upsTrackingNo', title: '单号' },
        { key: 'upc', title: 'UPC' },
        { key: 'imei', title: 'IMEI' },
        { key: 'productName', title: '商品名称' },
        { key: 'quantity', title: '数量' },
      ],
      sampleRows: [
        {
          upsTrackingNo: '1Z999AA10123456784',
          upc: '194253149189',
          imei: '共 5 台，已列 2 个 IMEI',
          productName: 'iPhone 16 Pro',
          quantity: '5',
        },
        {
          upsTrackingNo: '',
          upc: '',
          imei: '356789012345678',
          productName: '',
          quantity: '',
        },
        {
          upsTrackingNo: '',
          upc: '',
          imei: '356789012345679',
          productName: '',
          quantity: '',
        },
        {
          upsTrackingNo: '1Z999AA10123456785',
          upc: '194253149189',
          imei: '共 4 台，已列 1 个 IMEI',
          productName: 'iPhone 16 Pro',
          quantity: '4',
        },
        {
          upsTrackingNo: '',
          upc: '',
          imei: '356789012345680',
          productName: '',
          quantity: '',
        },
      ],
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
      5001,
    );
  });

  it('creates a completed CSV export and writes an audit log', async () => {
    const { repository, service } = createService();

    await expect(
      service.createExport(
        {
          reportType: ReportType.INVENTORY_DETAIL,
          format: ReportExportFormat.CSV,
          fields: ['upsTrackingNo', 'upc', 'imei', 'productName', 'quantity'],
        },
        operator,
      ),
    ).resolves.toMatchObject({
      id: 'export-1',
      status: 'COMPLETED',
      rowCount: 5,
      fileName: 'inventory_detail-export-1.csv',
    });
    expect(repository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        exportId: 'export-1',
        operatorId: operator.id,
        reportType: ReportType.INVENTORY_DETAIL,
        rowCount: 5,
        format: ReportExportFormat.CSV,
      }),
    );
    const completedCall = repository.updateExport.mock.calls[0];
    const completedPayload = completedCall![0].filters as {
      metadata: { fileContent: string };
    };
    expect(completedPayload.metadata.fileContent).toContain('单号,UPC,IMEI,商品名称,数量');
    expect(completedPayload.metadata.fileContent).toContain(
      '1Z999AA10123456784,194253149189,共 5 台，已列 2 个 IMEI,iPhone 16 Pro,5',
    );
    expect(completedPayload.metadata.fileContent).toContain(
      ',,356789012345678,,',
    );
    expect(completedPayload.metadata.fileContent).toContain(
      ',,356789012345679,,',
    );
    expect(completedPayload.metadata.fileContent).toContain(
      '1Z999AA10123456785,194253149189,共 4 台，已列 1 个 IMEI,iPhone 16 Pro,4',
    );
    expect(completedPayload.metadata.fileContent).toContain(
      ',,356789012345680,,',
    );
  });

  it('includes box notes and uploaded tracking number in outbound detail downloads', async () => {
    const { service } = createService({ findRows: jest.fn().mockResolvedValue([outboundRow]) });

    await expect(
      service.preview({
        reportType: ReportType.OUTBOUND_DETAIL,
        fields: ['boxNo', 'shippingTrackingNo', 'boxNotes', 'imei'],
      }),
    ).resolves.toMatchObject({
      selectedFields: ['boxNo', 'shippingTrackingNo', 'boxNotes', 'imei'],
      sampleRows: [
        {
          boxNo: 'BOX-20260621-001',
          shippingTrackingNo: 'UPLOAD-TRACK-001',
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
    expect(completedPayload.metadata.fileContent).toContain('上传单号：');
    expect(completedPayload.metadata.fileContent).toContain('UPLOAD-TRACK-001');
    expect(completedPayload.metadata.fileContent).toContain('UPLOAD-TRACK-002');
    expect(completedPayload.metadata.fileContent).toContain('SN-002');
    expect(completedPayload.metadata.fileContent).toContain('356789012345679');
    expect(completedPayload.metadata.fileContent).toContain('实际扫描总数：');
    expect(completedPayload.metadata.fileContent).toContain(
      '<Cell ss:StyleID="Total"><Data ss:Type="Number">2</Data></Cell>',
    );
  });

  it('allows outbound detail Excel downloads for an open box before sealing', async () => {
    const openBoxRow = {
      ...outboundRow,
      outboundBox: {
        ...outboundRow.outboundBox,
        status: 'OPEN',
        sealedAt: null,
      },
    };
    const { repository, service } = createService({
      findRows: jest.fn().mockResolvedValue([openBoxRow]),
    });

    await expect(
      service.createExport(
        {
          reportType: ReportType.OUTBOUND_DETAIL,
          format: ReportExportFormat.EXCEL,
          filters: { boxNo: 'BOX-20260621-001' },
          fields: ['boxNo', 'boxStatus', 'imei'],
        },
        operator,
      ),
    ).resolves.toMatchObject({
      fileName: 'outbound_detail-BOX-20260621-001-export-1.xls',
      rowCount: 1,
    });

    expect(repository.findRows).toHaveBeenCalledWith(
      ReportType.OUTBOUND_DETAIL,
      { boxNo: 'BOX-20260621-001' },
      expect.any(Number),
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

  it('expands inventory summary rows when quantity is greater than one', async () => {
    const { service } = createService({
      findRows: jest.fn().mockResolvedValue([
        {
          ...inventoryRow,
          quantity: 2,
        },
      ]),
    });

    await expect(
      service.preview({
        reportType: ReportType.INVENTORY_DETAIL,
        fields: ['upsTrackingNo', 'upc', 'imei', 'productName', 'quantity'],
      }),
    ).resolves.toMatchObject({
      estimatedRowCount: 2,
      sampleRows: [
        {
          upsTrackingNo: '1Z999AA10123456784',
          upc: '194253149189',
          imei: '共 2 台，已列 1 个 IMEI',
          productName: 'iPhone 16 Pro',
          quantity: '2',
        },
        {
          upsTrackingNo: '',
          upc: '',
          imei: '356789012345678',
          productName: '',
          quantity: '',
        },
      ],
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
      content:
        '单号,UPC,IMEI,商品名称,数量\n1Z999AA10123456784,194253149189,356789012345678,iPhone 16 Pro,3',
    });
  });
});
