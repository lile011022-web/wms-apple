/* global jest */
import {
  CustomerStatus,
  ExceptionStatus,
  ExceptionType,
  InboundBatchStatus,
  InboundItemStatus,
  ProductStatus,
  InventoryStatus,
} from '@prisma/client';
import { SettingsService } from '../../settings/settings.service';
import { InboundRepository } from '../inbound.repository';
import { InboundService } from '../inbound.service';

const operator = {
  id: 'user-1',
  email: 'admin@wms-scan.local',
  name: 'Admin',
  roles: ['ADMIN'],
  permissions: ['inbound.manage'],
};

const settings = {
  warehouse: { defaultWarehouseId: 'warehouse-1' },
  scanRules: {
    requiresLockedCustomer: true,
    enforceOutboundCustomerOwnership: true,
    detectDuplicateImei: true,
    detectDuplicateUps: true,
  },
  exceptionHandling: {
    createUnmatchedUpcException: true,
    createDuplicateImeiException: true,
    createDuplicateUpsException: true,
  },
  notifications: {
    exceptionEmailEnabled: false,
    reportExportEmailEnabled: false,
  },
  retention: {
    auditLogRetentionDays: 365,
    reportExportRetentionDays: 30,
    exceptionRecordRetentionDays: 730,
  },
};

const customer = {
  id: 'customer-1',
  code: 'CUST-001',
  name: 'Apple Reseller',
  contactName: null,
  contactInfo: null,
  status: CustomerStatus.ACTIVE,
  notes: null,
  createdAt: new Date('2026-06-17T00:00:00Z'),
  updatedAt: new Date('2026-06-17T00:00:00Z'),
};

const warehouse = {
  id: 'warehouse-1',
  code: 'US-LAX-01',
  name: 'US Los Angeles Warehouse',
  address: null,
  timezone: 'America/Los_Angeles',
  isActive: true,
  createdAt: new Date('2026-06-17T00:00:00Z'),
  updatedAt: new Date('2026-06-17T00:00:00Z'),
};

const product = {
  id: 'product-1',
  sku: 'IPHONE-16-PRO-256-NAT',
  brand: 'Apple',
  name: 'iPhone 16 Pro 256GB Natural Titanium',
  model: 'iPhone 16 Pro',
  category: 'iPhone',
  color: 'Natural Titanium',
  capacity: '256GB',
  requiresImei: true,
  status: ProductStatus.ACTIVE,
  createdAt: new Date('2026-06-17T00:00:00Z'),
  updatedAt: new Date('2026-06-17T00:00:00Z'),
  upcs: [
    {
      id: 'upc-1',
      upc: '194253149189',
      productId: 'product-1',
      status: ProductStatus.ACTIVE,
      createdAt: new Date('2026-06-17T00:00:00Z'),
      updatedAt: new Date('2026-06-17T00:00:00Z'),
    },
  ],
};

const draft = {
  id: 'draft-1',
  batchNo: 'INB-20260617000000-ABC123',
  customerId: 'customer-1',
  warehouseId: 'warehouse-1',
  operatorId: 'user-1',
  status: InboundBatchStatus.DRAFT,
  confirmedAt: null,
  notes: null,
  createdAt: new Date('2026-06-17T00:00:00Z'),
  updatedAt: new Date('2026-06-17T00:00:00Z'),
  customer,
  warehouse,
  operator,
  inboundItems: [],
  inventoryItems: [],
};

const pendingItem = {
  id: 'item-1',
  inboundBatchId: 'draft-1',
  customerId: 'customer-1',
  productId: 'product-1',
  inventoryItemId: null,
  upsTrackingNo: '1Z999AA10123456784',
  upc: '194253149189',
  imei: '356789012345678',
  serial: null,
  status: InboundItemStatus.PENDING,
  scannedAt: new Date('2026-06-17T00:00:00Z'),
  createdAt: new Date('2026-06-17T00:00:00Z'),
  updatedAt: new Date('2026-06-17T00:00:00Z'),
  inboundBatch: draft,
  customer,
  product,
  exceptions: [],
  inventoryItem: null,
};

function createService(repositoryOverrides: Partial<Record<keyof InboundRepository, jest.Mock>>) {
  const repository = {
    findCustomerById: jest.fn().mockResolvedValue(customer),
    findWarehouseById: jest.fn().mockResolvedValue(warehouse),
    createDraft: jest.fn().mockResolvedValue(draft),
    findDraftById: jest.fn().mockResolvedValue(draft),
    findProductByUpc: jest.fn().mockResolvedValue({
      id: 'upc-1',
      upc: '194253149189',
      productId: 'product-1',
      status: ProductStatus.ACTIVE,
      createdAt: new Date('2026-06-17T00:00:00Z'),
      updatedAt: new Date('2026-06-17T00:00:00Z'),
      product,
    }),
    findInventoryByImei: jest.fn().mockResolvedValue(null),
    findInventoryBySerial: jest.fn().mockResolvedValue(null),
    countConfirmedItemsByUps: jest.fn().mockResolvedValue(0),
    createItem: jest.fn().mockResolvedValue(pendingItem),
    findItemById: jest.fn().mockResolvedValue(pendingItem),
    findRecords: jest.fn().mockResolvedValue([1, [pendingItem]]),
    countRecords: jest.fn().mockResolvedValue(1),
    findRecordItemsByBatchId: jest.fn().mockResolvedValue([1, [pendingItem]]),
    deleteItem: jest.fn(),
    clearDraftItems: jest.fn(),
    confirmDraft: jest.fn().mockResolvedValue({
      ...draft,
      status: InboundBatchStatus.CONFIRMED,
      confirmedAt: new Date('2026-06-17T00:00:00Z'),
      inboundItems: [{ ...pendingItem, status: InboundItemStatus.CONFIRMED }],
    }),
    ...repositoryOverrides,
  } as unknown as jest.Mocked<InboundRepository>;
  const settingsService = {
    getSettings: jest.fn().mockResolvedValue(settings),
  } as unknown as jest.Mocked<SettingsService>;

  return {
    repository,
    service: new InboundService(repository, settingsService),
  };
}

describe('InboundService', () => {
  it('requires a locked customer when creating an inbound draft', async () => {
    const { service } = createService({});

    await expect(service.createDraft({}, operator)).rejects.toThrow(
      'Inbound scanning requires a locked customer.',
    );
  });

  it('accepts UPS, USPS, and FedEx package tracking numbers for inbound scans', async () => {
    const { repository, service } = createService({});

    await expect(
      service.scanUps('draft-1', { upsTrackingNo: ' 1z999aa10123456784 ' }),
    ).resolves.toMatchObject({
      upsTrackingNo: '1Z999AA10123456784',
      valid: true,
      duplicate: false,
    });
    await expect(
      service.scanUps('draft-1', { upsTrackingNo: '9400 1118 9922 3857 0000 00' }),
    ).resolves.toMatchObject({
      upsTrackingNo: '9400111899223857000000',
      valid: true,
    });
    await expect(
      service.scanUps('draft-1', { upsTrackingNo: '9611020987654312345672' }),
    ).resolves.toMatchObject({
      upsTrackingNo: '9611020987654312345672',
      valid: true,
    });

    expect(repository.countConfirmedItemsByUps).toHaveBeenCalledWith('1Z999AA10123456784');
    expect(repository.countConfirmedItemsByUps).toHaveBeenCalledWith('9400111899223857000000');
    expect(repository.countConfirmedItemsByUps).toHaveBeenCalledWith('9611020987654312345672');
  });

  it('rejects unsupported package tracking numbers before saving inbound items', async () => {
    const { service } = createService({});

    await expect(
      service.addItem('draft-1', {
        upsTrackingNo: 'not-a-tracking-number',
        upc: '194253149189',
        imei: '356789012345678',
      }),
    ).rejects.toThrow('Invalid package tracking number format.');
  });

  it('creates an unmatched UPC exception item for preview', async () => {
    const exceptionItem = {
      ...pendingItem,
      productId: null,
      product: null,
      upc: '884909876543',
      status: InboundItemStatus.EXCEPTION,
      exceptions: [
        {
          id: 'exception-1',
          type: ExceptionType.UPC_NOT_MATCHED,
          status: ExceptionStatus.OPEN,
          customerId: 'customer-1',
          warehouseId: 'warehouse-1',
          productId: null,
          inboundItemId: 'item-1',
          inventoryItemId: null,
          rawValue: '884909876543',
          upsTrackingNo: null,
          upc: '884909876543',
          imei: null,
          serial: null,
          resolutionNote: null,
          resolvedById: null,
          resolvedAt: null,
          beforeSnapshot: null,
          afterSnapshot: null,
          createdAt: new Date('2026-06-17T00:00:00Z'),
          updatedAt: new Date('2026-06-17T00:00:00Z'),
        },
      ],
    };
    const { repository, service } = createService({
      findProductByUpc: jest.fn().mockResolvedValue(null),
      createItem: jest.fn().mockResolvedValue(exceptionItem),
    });

    await expect(service.addItem('draft-1', { upc: '884909876543' })).resolves.toMatchObject({
      status: InboundItemStatus.EXCEPTION,
      product: null,
      exceptions: [{ type: ExceptionType.UPC_NOT_MATCHED }],
    });
    expect(repository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        upc: '884909876543',
        status: InboundItemStatus.EXCEPTION,
      }),
      expect.objectContaining({
        type: ExceptionType.UPC_NOT_MATCHED,
        rawValue: '884909876543',
      }),
    );
  });

  it('imports inbound items into an open draft and reports failed rows', async () => {
    const { repository, service } = createService({
      findProductByUpc: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'upc-1',
          upc: '194253149189',
          productId: 'product-1',
          status: ProductStatus.ACTIVE,
          createdAt: new Date('2026-06-17T00:00:00Z'),
          updatedAt: new Date('2026-06-17T00:00:00Z'),
          product,
        })
        .mockResolvedValueOnce(null),
      findDraftById: jest
        .fn()
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce({ ...draft, inboundItems: [pendingItem] }),
    });

    await expect(
      service.importItems('draft-1', {
        items: [
          {
            upsTrackingNo: '1Z999AA10123456784',
            upc: '194253149189',
            imei: '356789012345678',
          },
          {
            upsTrackingNo: 'not-a-tracking-number',
            upc: '194253149189',
            imei: '356789012345679',
          },
        ],
      }),
    ).resolves.toMatchObject({
      importedCount: 1,
      failedCount: 1,
      failedRows: [{ lineNo: 2, message: 'Invalid package tracking number format.' }],
      draft: { id: 'draft-1' },
    });

    expect(repository.createItem).toHaveBeenCalledTimes(1);
  });

  it('creates a duplicate IMEI exception item before confirmation', async () => {
    const duplicateInventory = { id: 'inventory-1' };
    const exceptionItem = {
      ...pendingItem,
      status: InboundItemStatus.EXCEPTION,
      exceptions: [
        {
          id: 'exception-1',
          type: ExceptionType.IMEI_DUPLICATED,
          status: ExceptionStatus.OPEN,
          rawValue: '356789012345678',
          resolutionNote: null,
        },
      ],
    };
    const { repository, service } = createService({
      findInventoryByImei: jest.fn().mockResolvedValue(duplicateInventory),
      createItem: jest.fn().mockResolvedValue(exceptionItem),
    });

    await service.addItem('draft-1', {
      upc: '194253149189',
      imei: '356789012345678',
    });

    expect(repository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ status: InboundItemStatus.EXCEPTION }),
      expect.objectContaining({
        type: ExceptionType.IMEI_DUPLICATED,
        rawValue: '356789012345678',
      }),
    );
  });

  it('confirms a draft through the repository transaction boundary', async () => {
    const { repository, service } = createService({
      findDraftById: jest.fn().mockResolvedValue({ ...draft, inboundItems: [pendingItem] }),
    });

    await expect(service.confirmDraft('draft-1', operator)).resolves.toMatchObject({
      status: InboundBatchStatus.CONFIRMED,
      summary: {
        confirmedItems: 1,
      },
    });
    expect(repository.confirmDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 'draft-1',
        operatorId: 'user-1',
        duplicateImeiExceptionEnabled: true,
        duplicateUpsExceptionEnabled: true,
      }),
    );
  });

  it('rejects duplicate IMEI values within the same draft before confirmation', async () => {
    const duplicateItem = {
      ...pendingItem,
      id: 'item-2',
      upsTrackingNo: '9400111899223857000000',
      createdAt: new Date('2026-06-17T00:01:00Z'),
    };
    const { repository, service } = createService({
      findDraftById: jest
        .fn()
        .mockResolvedValue({ ...draft, inboundItems: [pendingItem, duplicateItem] }),
    });

    await expect(service.confirmDraft('draft-1', operator)).rejects.toThrow(
      '本次入库单内 IMEI 重复: 356789012345678。请删除重复明细或修正后再确认入库。',
    );
    expect(repository.confirmDraft).not.toHaveBeenCalled();
  });

  it('passes combined inbound record filters to the repository', async () => {
    const { repository, service } = createService({});

    await expect(
      service.listRecords({
        page: 2,
        pageSize: 10,
        search: ' Apple ',
        sortBy: 'imei',
        sortOrder: 'asc',
        customerId: 'customer-1',
        warehouseId: 'warehouse-1',
        status: InboundItemStatus.CONFIRMED,
        inventoryStatus: InventoryStatus.IN_STOCK,
        upsTrackingNo: ' 1z999aa10123456784 ',
        upc: ' 194253149189 ',
        imei: ' 356789012345678 ',
        dateFrom: '2026-06-01T00:00:00.000Z',
        dateTo: '2026-06-30T23:59:59.999Z',
      }),
    ).resolves.toMatchObject({
      page: 2,
      pageSize: 10,
      total: 1,
      items: [
        {
          id: 'item-1',
          selectableForCustomerChange: true,
        },
      ],
    });

    expect(repository.findRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        search: 'Apple',
        customerId: 'customer-1',
        warehouseId: 'warehouse-1',
        status: InboundItemStatus.CONFIRMED,
        inventoryStatus: InventoryStatus.IN_STOCK,
        upsTrackingNo: '1Z999AA10123456784',
        upc: '194253149189',
        imei: '356789012345678',
        orderBy: { imei: 'asc' },
      }),
    );
  });

  it('lists items for an inbound record batch', async () => {
    const { repository, service } = createService({});

    await expect(
      service.getRecordItems('draft-1', {
        page: 1,
        pageSize: 20,
        sortOrder: 'desc',
      }),
    ).resolves.toMatchObject({
      batchId: 'draft-1',
      total: 1,
      items: [{ id: 'item-1' }],
    });

    expect(repository.findRecordItemsByBatchId).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: 'draft-1',
        skip: 0,
        take: 20,
      }),
    );
  });

  it('creates an export preview with reusable report filters', async () => {
    const { repository, service } = createService({});

    await expect(
      service.createExportPreview({
        page: 1,
        pageSize: 20,
        sortOrder: 'desc',
        customerId: 'customer-1',
        status: InboundItemStatus.CONFIRMED,
      }),
    ).resolves.toEqual({
      reportType: 'inbound-records',
      estimatedRowCount: 1,
      filters: expect.objectContaining({
        customerId: 'customer-1',
        status: InboundItemStatus.CONFIRMED,
      }),
      reusableReportPayload: {
        reportType: 'inbound-records',
        filters: expect.objectContaining({
          customerId: 'customer-1',
          status: InboundItemStatus.CONFIRMED,
        }),
      },
    });
    expect(repository.countRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'customer-1',
        status: InboundItemStatus.CONFIRMED,
      }),
    );
  });
});
