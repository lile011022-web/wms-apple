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
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../settings/settings.service';
import { InboundRepository } from '../inbound.repository';
import { InboundService } from '../inbound.service';

const operator = {
  id: 'user-1',
  email: 'admin@wms-scan.local',
  name: 'Admin',
  roles: ['ADMIN'],
  permissions: ['inbound.manage'],
  sessionId: 'session-1',
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
  creatorSessionId: 'session-1',
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
  forcedInbound: false,
  forceReason: null,
  forcedAt: null,
  forcedById: null,
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

const confirmedInventoryItem = {
  id: 'inventory-1',
  customerId: 'customer-1',
  warehouseId: 'warehouse-1',
  productId: 'product-1',
  inboundBatchId: 'draft-1',
  imei: '356789012345678',
  serial: null,
  upc: '194253149189',
  upsTrackingNo: '1Z999AA10123456784',
  status: InventoryStatus.IN_STOCK,
  receivedAt: new Date('2026-06-17T00:00:00Z'),
  packedAt: null,
  outboundAt: null,
  voidedAt: null,
  createdAt: new Date('2026-06-17T00:00:00Z'),
  updatedAt: new Date('2026-06-17T00:00:00Z'),
};

const confirmedItem = {
  ...pendingItem,
  status: InboundItemStatus.CONFIRMED,
  inventoryItemId: confirmedInventoryItem.id,
  inboundBatch: {
    ...draft,
    status: InboundBatchStatus.CONFIRMED,
    confirmedAt: new Date('2026-06-17T00:00:00Z'),
  },
  inventoryItem: confirmedInventoryItem,
};

function createService(repositoryOverrides: Partial<Record<keyof InboundRepository, jest.Mock>>) {
  const repository = {
    findCustomerById: jest.fn().mockResolvedValue(customer),
    findWarehouseById: jest.fn().mockResolvedValue(warehouse),
    createDraft: jest.fn().mockResolvedValue(draft),
    findDraftById: jest.fn().mockResolvedValue(draft),
    findDraftByBatchNo: jest.fn().mockResolvedValue(draft),
    findLatestDraftByOperatorSession: jest.fn().mockResolvedValue(draft),
    claimDraftSession: jest.fn().mockResolvedValue({ count: 1 }),
    claimLatestLegacyDraft: jest.fn().mockResolvedValue(null),
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
    countDraftItemsByUps: jest.fn().mockResolvedValue(0),
    createItem: jest.fn().mockResolvedValue(pendingItem),
    updateItem: jest.fn().mockResolvedValue(pendingItem),
    findItemById: jest.fn().mockResolvedValue(pendingItem),
    findRecords: jest.fn().mockResolvedValue([1, [pendingItem]]),
    countRecords: jest.fn().mockResolvedValue(1),
    findRecordItemsByBatchId: jest.fn().mockResolvedValue([1, [pendingItem]]),
    deleteItem: jest.fn(),
    clearDraftItems: jest.fn(),
    forceConfirmItem: jest.fn(),
    correctRecordUpc: jest.fn().mockResolvedValue(confirmedItem),
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
  const configService = {
    get: jest.fn().mockReturnValue('false'),
  } as unknown as jest.Mocked<ConfigService>;

  return {
    repository,
    service: new InboundService(repository, settingsService, configService),
  };
}

describe('InboundService', () => {
  it('requires a locked customer when creating an inbound draft', async () => {
    const { service } = createService({});

    await expect(service.createDraft({}, operator)).rejects.toThrow(
      'Inbound scanning requires a locked customer.',
    );
  });

  it('auto-accepts UPS, 9622 FedEx, and warehouse compensation package tracking numbers for inbound scans', async () => {
    const { repository, service } = createService({});

    await expect(
      service.scanUps('draft-1', { upsTrackingNo: ' 1z999aa10123456784 ' }, operator),
    ).resolves.toMatchObject({
      upsTrackingNo: '1Z999AA10123456784',
      formatValid: true,
      autoAccepted: true,
      valid: true,
      duplicate: false,
    });
    await expect(
      service.scanUps('draft-1', { upsTrackingNo: '9622 1234 5678 9012 3456 78' }, operator),
    ).resolves.toMatchObject({
      upsTrackingNo: '9622123456789012345678',
      formatValid: true,
      autoAccepted: true,
      valid: true,
    });
    await expect(
      service.scanUps(
        'draft-1',
        { upsTrackingNo: '9622 0804 3000 9579 2651 0053 0689 178' },
        operator,
      ),
    ).resolves.toMatchObject({
      upsTrackingNo: '9622080430009579265100530689178',
      formatValid: true,
      autoAccepted: true,
      valid: true,
    });
    await expect(
      service.scanUps('draft-1', { upsTrackingNo: ' bb0000 jh05 ' }, operator),
    ).resolves.toMatchObject({
      upsTrackingNo: 'BB0000JH05',
      formatValid: true,
      autoAccepted: true,
      valid: true,
    });
    await expect(
      service.scanUps('draft-1', { upsTrackingNo: ' bb0000 ' }, operator),
    ).resolves.toMatchObject({
      upsTrackingNo: 'BB0000',
      formatValid: true,
      autoAccepted: true,
      valid: true,
    });

    expect(repository.countConfirmedItemsByUps).toHaveBeenCalledWith('1Z999AA10123456784');
    expect(repository.countConfirmedItemsByUps).toHaveBeenCalledWith('9622123456789012345678');
    expect(repository.countConfirmedItemsByUps).toHaveBeenCalledWith(
      '9622080430009579265100530689178',
    );
    expect(repository.countConfirmedItemsByUps).toHaveBeenCalledWith('BB0000JH05');
    expect(repository.countConfirmedItemsByUps).toHaveBeenCalledWith('BB0000');
    expect(repository.countDraftItemsByUps).toHaveBeenCalledWith('draft-1', '1Z999AA10123456784');
    expect(repository.countDraftItemsByUps).toHaveBeenCalledWith(
      'draft-1',
      '9622123456789012345678',
    );
    expect(repository.countDraftItemsByUps).toHaveBeenCalledWith(
      'draft-1',
      '9622080430009579265100530689178',
    );
    expect(repository.countDraftItemsByUps).toHaveBeenCalledWith('draft-1', 'BB0000JH05');
    expect(repository.countDraftItemsByUps).toHaveBeenCalledWith('draft-1', 'BB0000');
  });

  it('restores an open draft by batch number', async () => {
    const { repository, service } = createService({
      findDraftByBatchNo: jest.fn().mockResolvedValue(draft),
    });

    await expect(
      service.getDraftByBatchNo(' inb-20260617000000-abc123 ', operator),
    ).resolves.toMatchObject({
      id: 'draft-1',
      batchNo: 'INB-20260617000000-ABC123',
      status: InboundBatchStatus.DRAFT,
    });
    expect(repository.findDraftByBatchNo).toHaveBeenCalledWith('INB-20260617000000-ABC123');
  });

  it('restores the current operator latest open draft automatically', async () => {
    const { repository, service } = createService({
      findLatestDraftByOperatorSession: jest.fn().mockResolvedValue(draft),
    });

    await expect(service.getLatestDraftForOperator(operator)).resolves.toMatchObject({
      id: 'draft-1',
      batchNo: 'INB-20260617000000-ABC123',
      status: InboundBatchStatus.DRAFT,
    });
    expect(repository.findLatestDraftByOperatorSession).toHaveBeenCalledWith(
      operator.id,
      operator.sessionId,
    );
  });

  it('returns null when the current operator has no open draft to restore', async () => {
    const { service } = createService({
      findLatestDraftByOperatorSession: jest.fn().mockResolvedValue(null),
      claimLatestLegacyDraft: jest.fn().mockResolvedValue(null),
    });

    await expect(service.getLatestDraftForOperator(operator)).resolves.toBeNull();
  });

  it('rejects restoring a non-draft batch by batch number', async () => {
    const { service } = createService({
      findDraftByBatchNo: jest.fn().mockResolvedValue({
        ...draft,
        status: InboundBatchStatus.CONFIRMED,
      }),
    });

    await expect(service.getDraftByBatchNo('INB-20260617000000-ABC123', operator)).rejects.toThrow(
      'Inbound draft is already closed.',
    );
  });

  it('warns when the package tracking number already exists in the active draft', async () => {
    const { service } = createService({
      countDraftItemsByUps: jest.fn().mockResolvedValue(1),
    });

    await expect(
      service.scanUps('draft-1', { upsTrackingNo: '1Z999AA10123456784' }, operator),
    ).resolves.toMatchObject({
      upsTrackingNo: '1Z999AA10123456784',
      valid: true,
      currentDraftDuplicate: true,
      currentDraftDuplicateCount: 1,
    });
  });

  it('requires manual confirmation for USPS and non-9622 FedEx tracking numbers', async () => {
    const { repository, service } = createService({});

    await expect(
      service.scanUps('draft-1', { upsTrackingNo: '9400 1118 9922 3857 0000 00' }, operator),
    ).resolves.toMatchObject({
      upsTrackingNo: '9400111899223857000000',
      formatValid: true,
      autoAccepted: false,
      valid: false,
      duplicate: false,
      duplicateCount: 0,
    });
    await expect(
      service.scanUps('draft-1', { upsTrackingNo: '9611020987654312345672' }, operator),
    ).resolves.toMatchObject({
      upsTrackingNo: '9611020987654312345672',
      formatValid: true,
      autoAccepted: false,
      valid: false,
      duplicate: false,
      duplicateCount: 0,
    });
    await expect(
      service.scanUps('draft-1', { upsTrackingNo: '96320804008675235705004823280' }, operator),
    ).resolves.toMatchObject({
      upsTrackingNo: '96320804008675235705004823280',
      formatValid: true,
      autoAccepted: false,
      valid: false,
      duplicate: false,
      duplicateCount: 0,
    });

    expect(repository.countConfirmedItemsByUps).toHaveBeenCalledWith('9400111899223857000000');
    expect(repository.countConfirmedItemsByUps).toHaveBeenCalledWith('9611020987654312345672');
    expect(repository.countConfirmedItemsByUps).toHaveBeenCalledWith(
      '96320804008675235705004823280',
    );
  });

  it('rejects unsupported package tracking numbers before saving inbound items', async () => {
    const { service } = createService({});

    await expect(
      service.scanUps('draft-1', { upsTrackingNo: 'not-a-tracking-number' }, operator),
    ).resolves.toMatchObject({
      upsTrackingNo: 'NOT-A-TRACKING-NUMBER',
      formatValid: false,
      autoAccepted: false,
      valid: false,
      duplicate: false,
      duplicateCount: 0,
    });

    await expect(
      service.addItem(
        'draft-1',
        {
          upsTrackingNo: 'not-a-tracking-number',
          upc: '194253149189',
          imei: '356789012345678',
        },
        operator,
      ),
    ).rejects.toThrow('Invalid package tracking number format.');
  });

  it('rejects arbitrary package tracking even after operator confirmation', async () => {
    const { repository, service } = createService({});

    await expect(
      service.addItem(
        'draft-1',
        {
          upsTrackingNo: 'not-a-tracking-number',
          upc: '194253149189',
          imei: '356789012345678',
          trackingExceptionConfirmed: true,
        },
        operator,
      ),
    ).rejects.toThrow('Invalid package tracking number format.');
    expect(repository.createItem).not.toHaveBeenCalled();
  });

  it('allows valid USPS and non-9622 FedEx tracking only after operator confirmation', async () => {
    const { repository, service } = createService({});

    await expect(
      service.addItem(
        'draft-1',
        {
          upsTrackingNo: '9400111899223857000000',
          upc: '194253149189',
          imei: '356789012345678',
          trackingExceptionConfirmed: true,
        },
        operator,
      ),
    ).resolves.toMatchObject({ status: InboundItemStatus.PENDING });
    await expect(
      service.addItem(
        'draft-1',
        {
          upsTrackingNo: '9611020987654312345672',
          upc: '194253149189',
          imei: '356789012345679',
          trackingExceptionConfirmed: true,
        },
        operator,
      ),
    ).resolves.toMatchObject({ status: InboundItemStatus.PENDING });

    expect(repository.createItem).toHaveBeenCalledTimes(2);
  });

  it('allows warehouse compensation package tracking without exception confirmation', async () => {
    const { repository, service } = createService({});

    await expect(
      service.addItem(
        'draft-1',
        {
          upsTrackingNo: 'bb0000',
          upc: '194253149189',
          imei: '356789012345678',
        },
        operator,
      ),
    ).resolves.toMatchObject({ status: InboundItemStatus.PENDING });
    expect(repository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        upsTrackingNo: 'BB0000',
        status: InboundItemStatus.PENDING,
      }),
      undefined,
      {
        draftId: 'draft-1',
        operatorId: operator.id,
        sessionId: operator.sessionId,
      },
    );
  });

  it('requires package tracking before saving inbound items', async () => {
    const { repository, service } = createService({});

    await expect(
      service.addItem(
        'draft-1',
        {
          upc: '194253149189',
          imei: '356789012345678',
        },
        operator,
      ),
    ).rejects.toThrow('Package tracking number is required for inbound scanning.');
    expect(repository.createItem).not.toHaveBeenCalled();
  });

  it('rejects a UPS package number scanned into the IMEI field', async () => {
    const { repository, service } = createService({});

    await expect(
      service.addItem(
        'draft-1',
        {
          upsTrackingNo: '1Z999AA10123456784',
          upc: '194253149189',
          imei: '1Z9265F30352351025',
        },
        operator,
      ),
    ).rejects.toThrow('IMEI 位置扫入了物流单号');
    expect(repository.createItem).not.toHaveBeenCalled();
  });

  it('rejects repeated values across inbound scan fields', async () => {
    const { repository, service } = createService({});

    await expect(
      service.addItem(
        'draft-1',
        {
          upsTrackingNo: 'BB0000194253149189',
          upc: '194253149189',
          imei: 'BB0000194253149189',
        },
        operator,
      ),
    ).rejects.toThrow('IMEI 位置扫入了物流单号');
    expect(repository.createItem).not.toHaveBeenCalled();
  });

  it('force-confirms a matched exception item with a required reason', async () => {
    const exceptionItem = {
      ...pendingItem,
      status: InboundItemStatus.EXCEPTION,
      inboundBatch: {
        ...draft,
        status: InboundBatchStatus.CONFIRMED,
      },
      exceptions: [
        {
          id: 'exception-1',
          type: ExceptionType.UPS_DUPLICATED,
          status: ExceptionStatus.OPEN,
          customerId: 'customer-1',
          warehouseId: 'warehouse-1',
          productId: 'product-1',
          inboundItemId: 'item-1',
          inventoryItemId: null,
          rawValue: '1Z999AA10123456784',
          upsTrackingNo: '1Z999AA10123456784',
          upc: '194253149189',
          imei: '356789012345678',
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
    const confirmedItem = {
      ...exceptionItem,
      status: InboundItemStatus.CONFIRMED,
      inventoryItemId: 'inventory-1',
      inventoryItem: {
        id: 'inventory-1',
        customerId: 'customer-1',
        warehouseId: 'warehouse-1',
        productId: 'product-1',
        inboundBatchId: 'draft-1',
        outboundBoxId: null,
        imei: '356789012345678',
        serial: null,
        upc: '194253149189',
        upsTrackingNo: '1Z999AA10123456784',
        status: InventoryStatus.IN_STOCK,
        notes: null,
        receivedAt: new Date('2026-06-17T00:00:00Z'),
        packedAt: null,
        shippedAt: null,
        voidedAt: null,
        createdAt: new Date('2026-06-17T00:00:00Z'),
        updatedAt: new Date('2026-06-17T00:00:00Z'),
      },
      forcedInbound: true,
      forceReason: 'FedEx tracking reviewed',
      forcedAt: new Date('2026-06-17T00:00:00Z'),
      forcedById: 'user-1',
    };
    const { repository, service } = createService({
      findItemById: jest.fn().mockResolvedValue(exceptionItem),
      forceConfirmItem: jest.fn().mockResolvedValue(confirmedItem),
    });

    await expect(
      service.forceConfirmRecord('item-1', { reason: ' FedEx tracking reviewed ' }, operator),
    ).resolves.toMatchObject({
      id: 'item-1',
      status: InboundItemStatus.CONFIRMED,
      inventoryItemId: 'inventory-1',
      forcedInbound: true,
      forceReason: 'FedEx tracking reviewed',
    });
    expect(repository.forceConfirmItem).toHaveBeenCalledWith({
      itemId: 'item-1',
      operatorId: 'user-1',
      reason: 'FedEx tracking reviewed',
    });
  });

  it('corrects UPC on a confirmed inbound record and linked inventory', async () => {
    const nextProduct = {
      ...product,
      id: 'product-2',
      sku: 'IPHONE-16-PRO-128-BLK',
      name: 'iPhone 16 Pro 128GB Black Titanium',
      upcs: [],
    };
    const correctedItem = {
      ...confirmedItem,
      upc: '195950251593',
      productId: nextProduct.id,
      product: nextProduct,
      inventoryItem: {
        ...confirmedInventoryItem,
        upc: '195950251593',
        productId: nextProduct.id,
      },
    };
    const { repository, service } = createService({
      findItemById: jest.fn().mockResolvedValue(confirmedItem),
      findProductByUpc: jest.fn().mockResolvedValue({
        id: 'upc-2',
        upc: '195950251593',
        productId: nextProduct.id,
        status: ProductStatus.ACTIVE,
        createdAt: new Date('2026-06-17T00:00:00Z'),
        updatedAt: new Date('2026-06-17T00:00:00Z'),
        product: nextProduct,
      }),
      correctRecordUpc: jest.fn().mockResolvedValue(correctedItem),
    });

    await expect(
      service.correctRecordUpc(
        'item-1',
        { upc: ' 195950251593 ', reason: 'UPC scanned wrong during receiving' },
        operator,
      ),
    ).resolves.toMatchObject({
      upc: '195950251593',
      product: { id: nextProduct.id, name: nextProduct.name },
    });

    expect(repository.correctRecordUpc).toHaveBeenCalledWith({
      itemId: confirmedItem.id,
      inventoryItemId: confirmedInventoryItem.id,
      operatorId: operator.id,
      upsTrackingNo: '1Z999AA10123456784',
      upc: '195950251593',
      imei: '356789012345678',
      serial: undefined,
      productId: nextProduct.id,
      reason: 'UPC scanned wrong during receiving',
    });
  });

  it('rejects UPC correction after inventory is packed or outbound', async () => {
    const { service } = createService({
      findItemById: jest.fn().mockResolvedValue({
        ...confirmedItem,
        inventoryItem: {
          ...confirmedInventoryItem,
          status: InventoryStatus.PACKED,
        },
      }),
    });

    await expect(
      service.correctRecordUpc(
        'item-1',
        { upc: '195950251593', reason: 'UPC scanned wrong during receiving' },
        operator,
      ),
    ).rejects.toThrow('Packed or outbound inventory cannot be corrected here.');
  });

  it('corrects an exception inbound record and saves it as normal inbound', async () => {
    const exceptionItem = {
      ...pendingItem,
      status: InboundItemStatus.EXCEPTION,
      productId: null,
      product: null,
      inventoryItemId: null,
      inventoryItem: null,
      upc: '357017259903923',
      imei: null,
      serial: 'SG3R4GR71M0',
      inboundBatch: {
        ...draft,
        status: InboundBatchStatus.CONFIRMED,
      },
    };
    const correctedItem = {
      ...confirmedItem,
      upc: '195950251593',
      imei: '357017259903923',
      serial: null,
    };
    const { repository, service } = createService({
      findItemById: jest.fn().mockResolvedValue(exceptionItem),
      findProductByUpc: jest.fn().mockResolvedValue({
        id: 'upc-1',
        upc: '195950251593',
        productId: product.id,
        status: ProductStatus.ACTIVE,
        createdAt: new Date('2026-06-17T00:00:00Z'),
        updatedAt: new Date('2026-06-17T00:00:00Z'),
        product,
      }),
      correctRecordUpc: jest.fn().mockResolvedValue(correctedItem),
    });

    await expect(
      service.correctRecordUpc(
        'item-1',
        {
          upsTrackingNo: '9622080430009579265100530689178',
          upc: '195950251593',
          imei: '357017259903923',
          serial: '',
          reason: 'UPC and identity were scanned into the wrong fields',
        },
        operator,
      ),
    ).resolves.toMatchObject({
      status: InboundItemStatus.CONFIRMED,
      upc: '195950251593',
      imei: '357017259903923',
    });

    expect(repository.correctRecordUpc).toHaveBeenCalledWith({
      itemId: exceptionItem.id,
      inventoryItemId: undefined,
      operatorId: operator.id,
      upsTrackingNo: '9622080430009579265100530689178',
      upc: '195950251593',
      imei: '357017259903923',
      serial: undefined,
      productId: product.id,
      reason: 'UPC and identity were scanned into the wrong fields',
    });
  });

  it('rejects inbound-record correction while the source batch is still a draft', async () => {
    const { repository, service } = createService({
      findItemById: jest.fn().mockResolvedValue({
        ...pendingItem,
        inboundBatch: {
          ...draft,
          status: InboundBatchStatus.DRAFT,
        },
      }),
    });

    await expect(
      service.correctRecordUpc(
        'item-1',
        { upc: '195950251593', reason: 'Fix before confirmation' },
        operator,
      ),
    ).rejects.toThrow('当前入库单还未确认，请回到入库扫码页面编辑或删除这条明细后再确认入库。');
    expect(repository.correctRecordUpc).not.toHaveBeenCalled();
  });

  it('rejects force inbound when the exception item has no matched active product', async () => {
    const { service } = createService({
      findItemById: jest.fn().mockResolvedValue({
        ...pendingItem,
        productId: null,
        product: null,
        status: InboundItemStatus.EXCEPTION,
        inboundBatch: {
          ...draft,
          status: InboundBatchStatus.CONFIRMED,
        },
      }),
    });

    await expect(
      service.forceConfirmRecord('item-1', { reason: 'manual review' }, operator),
    ).rejects.toThrow('Cannot force inbound without a matched active product.');
  });

  it('rejects force inbound when IMEI or Serial already exists in inventory', async () => {
    const { service } = createService({
      findItemById: jest.fn().mockResolvedValue({
        ...pendingItem,
        status: InboundItemStatus.EXCEPTION,
        inboundBatch: {
          ...draft,
          status: InboundBatchStatus.CONFIRMED,
        },
      }),
      findInventoryByImei: jest.fn().mockResolvedValue({ id: 'inventory-existing' }),
    });

    await expect(
      service.forceConfirmRecord('item-1', { reason: 'manual review' }, operator),
    ).rejects.toThrow('Cannot force inbound with duplicated IMEI or Serial.');
  });

  it('rejects UPC values that are not in the active product library before saving a preview row', async () => {
    const { repository, service } = createService({
      findProductByUpc: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.addItem(
        'draft-1',
        {
          upsTrackingNo: '1Z999AA10123456784',
          upc: '884909876543',
          imei: '356789012345678',
        },
        operator,
      ),
    ).rejects.toThrow('UPC 未匹配商品库，请先在商品管理中维护这个 UPC 后再扫码入库。');
    expect(repository.createItem).not.toHaveBeenCalled();
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
      service.importItems(
        'draft-1',
        {
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
        },
        operator,
      ),
    ).resolves.toMatchObject({
      importedCount: 1,
      failedCount: 1,
      failedRows: [{ lineNo: 2, message: 'Invalid package tracking number format.' }],
      draft: { id: 'draft-1' },
    });

    expect(repository.createItem).toHaveBeenCalledTimes(1);
  });

  it('rejects existing inventory IMEI before saving another preview row', async () => {
    const duplicateInventory = { id: 'inventory-1' };
    const { repository, service } = createService({
      findInventoryByImei: jest.fn().mockResolvedValue(duplicateInventory),
    });

    await expect(
      service.addItem(
        'draft-1',
        {
          upsTrackingNo: '1Z999AA10123456784',
          upc: '194253149189',
          imei: '356789012345678',
        },
        operator,
      ),
    ).rejects.toThrow('IMEI 已存在库存记录，不能重复入库: 356789012345678。请修正后再加入明细。');
    expect(repository.createItem).not.toHaveBeenCalled();
  });

  it('rejects duplicate IMEI inside the active draft before saving another preview row', async () => {
    const { repository, service } = createService({
      findDraftById: jest.fn().mockResolvedValue({ ...draft, inboundItems: [pendingItem] }),
    });

    await expect(
      service.addItem(
        'draft-1',
        {
          upsTrackingNo: '1Z999AA10123456784',
          upc: '194253149189',
          imei: '356789012345678',
        },
        operator,
      ),
    ).rejects.toThrow(
      '当前入库单内 IMEI 已重复: 356789012345678。请修正或删除重复明细后再继续入库。',
    );
    expect(repository.createItem).not.toHaveBeenCalled();
  });

  it('rejects draft item correction when it would duplicate another row identity', async () => {
    const duplicateDraftItem = {
      ...pendingItem,
      id: 'item-2',
      imei: '357017259903923',
    };
    const { repository, service } = createService({
      findDraftById: jest.fn().mockResolvedValue({
        ...draft,
        inboundItems: [pendingItem, duplicateDraftItem],
      }),
      findItemById: jest.fn().mockResolvedValue(duplicateDraftItem),
    });

    await expect(
      service.updateItem(
        'draft-1',
        'item-2',
        {
          upsTrackingNo: '1Z999AA10123456784',
          upc: '194253149189',
          imei: '356789012345678',
        },
        operator,
      ),
    ).rejects.toThrow(
      '当前入库单内 IMEI 已重复: 356789012345678。请修正或删除重复明细后再继续入库。',
    );
    expect(repository.updateItem).not.toHaveBeenCalled();
  });

  it('accepts alphanumeric iPad IMEI values and normalizes them for duplicate checks', async () => {
    const iPadItem = {
      ...pendingItem,
      imei: 'SH9LRL91YFC',
    };
    const { repository, service } = createService({
      createItem: jest.fn().mockResolvedValue(iPadItem),
    });

    await expect(
      service.addItem(
        'draft-1',
        {
          upsTrackingNo: '1Z999AA10123456784',
          upc: '194253149189',
          imei: ' sh9lrl91yfc ',
        },
        operator,
      ),
    ).resolves.toMatchObject({
      imei: 'SH9LRL91YFC',
    });

    expect(repository.findInventoryByImei).toHaveBeenCalledWith('SH9LRL91YFC');
    expect(repository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        upsTrackingNo: '1Z999AA10123456784',
        imei: 'SH9LRL91YFC',
        status: InboundItemStatus.PENDING,
      }),
      undefined,
      {
        draftId: 'draft-1',
        operatorId: operator.id,
        sessionId: operator.sessionId,
      },
    );
  });

  it('allows package tracking and UPC only in simplified inbound mode', async () => {
    const simplifiedItem = {
      ...pendingItem,
      imei: null,
      serial: null,
    };
    const { repository, service } = createService({
      createItem: jest.fn().mockResolvedValue(simplifiedItem),
    });

    await expect(
      service.addItem(
        'draft-1',
        {
          upsTrackingNo: '1Z999AA10123456784',
          upc: '194253149189',
          scanMode: 'TRACKING_UPC',
        },
        operator,
      ),
    ).resolves.toMatchObject({
      status: InboundItemStatus.PENDING,
      imei: null,
      serial: null,
    });

    expect(repository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        upsTrackingNo: '1Z999AA10123456784',
        upc: '194253149189',
        imei: undefined,
        serial: undefined,
        status: InboundItemStatus.PENDING,
      }),
      undefined,
      {
        draftId: 'draft-1',
        operatorId: operator.id,
        sessionId: operator.sessionId,
      },
    );
  });

  it('corrects an exception draft item in place without creating another row', async () => {
    const exceptionItem = {
      ...pendingItem,
      id: 'item-exception',
      productId: null,
      product: null,
      upc: '884909876543',
      imei: null,
      status: InboundItemStatus.EXCEPTION,
      exceptions: [
        {
          id: 'exception-1',
          type: ExceptionType.UPC_NOT_MATCHED,
          status: ExceptionStatus.OPEN,
          rawValue: '884909876543',
          resolutionNote: null,
        },
      ],
    };
    const correctedItem = {
      ...pendingItem,
      id: 'item-exception',
      upc: '194253149189',
      imei: null,
      serial: null,
      status: InboundItemStatus.PENDING,
    };
    const { repository, service } = createService({
      findItemById: jest.fn().mockResolvedValue(exceptionItem),
      updateItem: jest.fn().mockResolvedValue(correctedItem),
    });

    await expect(
      service.updateItem(
        'draft-1',
        'item-exception',
        {
          upsTrackingNo: '1Z999AA10123456784',
          upc: '194253149189',
          scanMode: 'TRACKING_UPC',
        },
        operator,
      ),
    ).resolves.toMatchObject({
      id: 'item-exception',
      upc: '194253149189',
      status: InboundItemStatus.PENDING,
    });

    expect(repository.createItem).not.toHaveBeenCalled();
    expect(repository.updateItem).toHaveBeenCalledWith(
      'item-exception',
      expect.objectContaining({
        upsTrackingNo: '1Z999AA10123456784',
        upc: '194253149189',
        imei: null,
        serial: null,
        status: InboundItemStatus.PENDING,
      }),
      undefined,
      {
        draftId: 'draft-1',
        operatorId: operator.id,
        sessionId: operator.sessionId,
      },
    );
  });

  it('stops new inbound work when the latest draft item is still an exception', async () => {
    const latestExceptionItem = {
      ...pendingItem,
      id: 'item-latest-exception',
      status: InboundItemStatus.EXCEPTION,
      createdAt: new Date('2026-06-17T00:02:00Z'),
    };
    const { repository, service } = createService({
      findDraftById: jest
        .fn()
        .mockResolvedValue({ ...draft, inboundItems: [pendingItem, latestExceptionItem] }),
    });

    await expect(
      service.addItem(
        'draft-1',
        {
          upsTrackingNo: '9400111899223857000000',
          upc: '194253149189',
          scanMode: 'TRACKING_UPC',
        },
        operator,
      ),
    ).rejects.toThrow('上一条入库明细仍为异常，请先在当前入库单中修正该异常后再继续入库。');
    await expect(service.confirmDraft('draft-1', operator)).rejects.toThrow(
      '上一条入库明细仍为异常，请先在当前入库单中修正该异常后再继续入库。',
    );
    expect(repository.createItem).not.toHaveBeenCalled();
    expect(repository.confirmDraft).not.toHaveBeenCalled();
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

  it('rejects IMEI values that already exist in inventory before confirmation', async () => {
    const { repository, service } = createService({
      findDraftById: jest.fn().mockResolvedValue({ ...draft, inboundItems: [pendingItem] }),
      findInventoryByImei: jest.fn().mockResolvedValue({
        id: 'inventory-existing',
        imei: pendingItem.imei,
      }),
    });

    await expect(service.confirmDraft('draft-1', operator)).rejects.toThrow(
      'IMEI 已存在库存记录，不能重复入库: 356789012345678。请修正或删除重复明细后再确认入库。',
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
          batch: {
            operator: {
              id: 'user-1',
              email: 'admin@wms-scan.local',
              name: 'Admin',
            },
          },
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
