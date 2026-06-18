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
