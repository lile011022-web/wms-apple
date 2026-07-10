/* global jest */
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  CustomerStatus,
  InboundBatchStatus,
  InboundItemStatus,
  InventoryStatus,
  ProductStatus,
} from '@prisma/client';
import { CustomerChangeRepository } from '../customer-change.repository';
import { CustomerChangeService } from '../customer-change.service';

const now = new Date('2026-06-17T00:00:00Z');
const currentCustomer = {
  id: 'customer-1',
  code: 'CUST-001',
  name: 'Original Customer',
  contactName: null,
  contactInfo: null,
  status: CustomerStatus.ACTIVE,
  notes: null,
  createdAt: now,
  updatedAt: now,
};
const newCustomer = {
  ...currentCustomer,
  id: 'customer-2',
  code: 'CUST-002',
  name: 'Correct Customer',
};
const warehouse = {
  id: 'warehouse-1',
  code: 'US-LAX-01',
  name: 'US Los Angeles Warehouse',
  address: null,
  timezone: 'America/Los_Angeles',
  isActive: true,
  createdAt: now,
  updatedAt: now,
};
const operator = {
  id: 'user-1',
  sessionId: 'session-test',
  email: 'operator@wms-scan.local',
  name: 'Batch Operator',
  roles: ['ADMIN'],
  permissions: ['customers.manage'],
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
  createdAt: now,
  updatedAt: now,
  upcs: [
    {
      id: 'upc-1',
      upc: '194253149189',
      productId: 'product-1',
      status: ProductStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
    },
  ],
};
const inboundBatch = {
  id: 'batch-1',
  batchNo: 'INB-20260617-001',
  customerId: currentCustomer.id,
  warehouseId: warehouse.id,
  operatorId: operator.id,
  status: InboundBatchStatus.CONFIRMED,
  confirmedAt: now,
  notes: null,
  createdAt: now,
  updatedAt: now,
  warehouse,
  operator: {
    id: operator.id,
    email: operator.email,
    name: operator.name,
  },
};
const inventoryItem = {
  id: 'inventory-1',
  customerId: currentCustomer.id,
  warehouseId: warehouse.id,
  productId: product.id,
  inboundBatchId: inboundBatch.id,
  imei: '356789012345678',
  serial: null,
  upc: '194253149189',
  upsTrackingNo: '1Z999AA10123456784',
  status: InventoryStatus.IN_STOCK,
  receivedAt: now,
  packedAt: null,
  outboundAt: null,
  voidedAt: null,
  createdAt: now,
  updatedAt: now,
  customer: currentCustomer,
  warehouse,
  outboundBoxItems: [],
};
const inboundItem = {
  id: 'item-1',
  inboundBatchId: inboundBatch.id,
  customerId: currentCustomer.id,
  productId: product.id,
  inventoryItemId: inventoryItem.id,
  upsTrackingNo: '1Z999AA10123456784',
  upc: '194253149189',
  imei: '356789012345678',
  serial: null,
  status: InboundItemStatus.CONFIRMED,
  scannedAt: now,
  createdAt: now,
  updatedAt: now,
  customer: currentCustomer,
  product,
  inboundBatch,
  inventoryItem,
  exceptions: [],
};
const committedLog = {
  id: 'change-log-1',
  oldCustomerId: currentCustomer.id,
  newCustomerId: newCustomer.id,
  operatorId: operator.id,
  reason: 'Wrong customer selected during receiving.',
  affectedCount: 1,
  affectedItemIds: ['item-1'],
  beforeSnapshot: {},
  afterSnapshot: {},
  createdAt: now,
  oldCustomer: currentCustomer,
  newCustomer,
  operator: {
    id: operator.id,
    email: operator.email,
    name: operator.name,
  },
};

function createService(
  repositoryOverrides: Partial<Record<keyof CustomerChangeRepository, jest.Mock>> = {},
) {
  const repository = {
    findCustomerById: jest.fn((id: string) =>
      Promise.resolve(id === currentCustomer.id ? currentCustomer : newCustomer),
    ),
    findCandidates: jest.fn().mockResolvedValue([1, [inboundItem]]),
    findItemsByIds: jest.fn().mockResolvedValue([inboundItem]),
    findItemById: jest.fn().mockResolvedValue(inboundItem),
    findLogs: jest.fn().mockResolvedValue([1, [committedLog]]),
    findLogById: jest.fn().mockResolvedValue(committedLog),
    commit: jest.fn().mockResolvedValue(committedLog),
    ...repositoryOverrides,
  } as unknown as jest.Mocked<CustomerChangeRepository>;

  return {
    repository,
    service: new CustomerChangeService(repository),
  };
}

describe('CustomerChangeService', () => {
  it('lists only customer-change candidates with normalized filters', async () => {
    const { repository, service } = createService();

    await expect(
      service.listCandidates({
        page: 1,
        pageSize: 20,
        sortOrder: 'desc',
        currentCustomerId: currentCustomer.id,
        upsTrackingNo: ' 1z999aa10123456784 ',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [{ id: 'item-1', changeable: true }],
    });
    expect(repository.findCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        currentCustomerId: currentCustomer.id,
        upsTrackingNo: '1Z999AA10123456784',
      }),
    );
  });

  it('previews affected records and returns a commit token', async () => {
    const { service } = createService();

    await expect(
      service.preview({
        currentCustomerId: currentCustomer.id,
        newCustomerId: newCustomer.id,
        inboundItemIds: ['item-1'],
      }),
    ).resolves.toMatchObject({
      canCommit: true,
      affectedCount: 1,
      blockedCount: 0,
      currentCustomer: { id: currentCustomer.id },
      newCustomer: { id: newCustomer.id },
      impact: {
        inboundItems: 1,
        inventoryItems: 1,
      },
    });
  });

  it('blocks packed or outbound records during preview and commit', async () => {
    const { service } = createService({
      findItemsByIds: jest.fn().mockResolvedValue([
        {
          ...inboundItem,
          inventoryItem: {
            ...inventoryItem,
            status: InventoryStatus.OUTBOUND,
          },
        },
      ]),
    });

    const preview = await service.preview({
      currentCustomerId: currentCustomer.id,
      newCustomerId: newCustomer.id,
      inboundItemIds: ['item-1'],
    });
    expect(preview).toMatchObject({ canCommit: false, blockedCount: 1 });
    await expect(
      service.commit(
        {
          currentCustomerId: currentCustomer.id,
          newCustomerId: newCustomer.id,
          inboundItemIds: ['item-1'],
          reason: 'Wrong customer selected during receiving.',
          previewToken: preview.previewToken,
        },
        operator,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('requires a non-empty reason before committing', async () => {
    const { service } = createService();

    await expect(
      service.commit(
        {
          currentCustomerId: currentCustomer.id,
          newCustomerId: newCustomer.id,
          inboundItemIds: ['item-1'],
          reason: '   ',
          previewToken: 'stale',
        },
        operator,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('commits only after the preview token matches the current record set', async () => {
    const { repository, service } = createService();
    const preview = await service.preview({
      currentCustomerId: currentCustomer.id,
      newCustomerId: newCustomer.id,
      inboundItemIds: ['item-1'],
    });

    await expect(
      service.commit(
        {
          currentCustomerId: currentCustomer.id,
          newCustomerId: newCustomer.id,
          inboundItemIds: ['item-1'],
          reason: 'Wrong customer selected during receiving.',
          previewToken: preview.previewToken,
        },
        operator,
      ),
    ).resolves.toMatchObject({
      id: 'change-log-1',
      affectedCount: 1,
      oldCustomer: { id: currentCustomer.id },
      newCustomer: { id: newCustomer.id },
    });
    expect(repository.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        itemIds: ['item-1'],
        oldCustomerId: currentCustomer.id,
        newCustomerId: newCustomer.id,
        operatorId: operator.id,
      }),
    );
  });

  it('rejects commit when the preview token is stale', async () => {
    const { service } = createService();

    await expect(
      service.commit(
        {
          currentCustomerId: currentCustomer.id,
          newCustomerId: newCustomer.id,
          inboundItemIds: ['item-1'],
          reason: 'Wrong customer selected during receiving.',
          previewToken: 'stale',
        },
        operator,
      ),
    ).rejects.toThrow(ConflictException);
  });
});
