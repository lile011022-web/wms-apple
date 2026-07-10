/* global jest */
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  CustomerStatus,
  ExceptionStatus,
  ExceptionType,
  InventoryStatus,
  ProductStatus,
} from '@prisma/client';
import { ExceptionsRepository } from '../exceptions.repository';
import { ExceptionsService } from '../exceptions.service';

const now = new Date('2026-06-17T00:00:00Z');
const user = {
  id: 'user-1',
  sessionId: 'session-test',
  email: 'operator@wms-scan.local',
  name: 'Exception Handler',
  roles: ['ADMIN'],
  permissions: ['exceptions.manage'],
};
const customer = {
  id: 'customer-1',
  code: 'CUST-001',
  name: 'Apple Reseller',
  contactName: null,
  contactInfo: null,
  status: CustomerStatus.ACTIVE,
  notes: null,
  createdAt: now,
  updatedAt: now,
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
const exceptionRecord = {
  id: 'exception-1',
  type: ExceptionType.UPC_NOT_MATCHED,
  status: ExceptionStatus.OPEN,
  customerId: customer.id,
  warehouseId: warehouse.id,
  productId: product.id,
  inboundItemId: 'item-1',
  inventoryItemId: 'inventory-1',
  rawValue: '884909876543',
  upsTrackingNo: '1Z999AA10123456784',
  upc: '884909876543',
  imei: null,
  serial: null,
  resolutionNote: null,
  resolvedById: null,
  resolvedAt: null,
  beforeSnapshot: null,
  afterSnapshot: null,
  createdAt: now,
  updatedAt: now,
  customer,
  warehouse,
  product,
  inboundItem: {
    id: 'item-1',
    inboundBatchId: 'batch-1',
    customerId: customer.id,
    productId: product.id,
    inventoryItemId: 'inventory-1',
    upsTrackingNo: '1Z999AA10123456784',
    upc: '884909876543',
    imei: null,
    serial: null,
    status: 'EXCEPTION',
    scannedAt: now,
    createdAt: now,
    updatedAt: now,
    inboundBatch: {
      id: 'batch-1',
      batchNo: 'IN-20260617-001',
      confirmedAt: now,
      operator: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    },
  },
  inventoryItem: {
    id: 'inventory-1',
    customerId: customer.id,
    warehouseId: warehouse.id,
    productId: product.id,
    inboundBatchId: 'batch-1',
    imei: null,
    serial: null,
    upc: '884909876543',
    upsTrackingNo: '1Z999AA10123456784',
    status: InventoryStatus.EXCEPTION,
    receivedAt: now,
    packedAt: null,
    outboundAt: null,
    voidedAt: null,
    createdAt: now,
    updatedAt: now,
    outboundBoxItems: [],
  },
};

function createService(
  repositoryOverrides: Partial<Record<keyof ExceptionsRepository, jest.Mock>> = {},
) {
  const repository = {
    findMany: jest.fn().mockResolvedValue([1, [exceptionRecord]]),
    getSummary: jest.fn().mockResolvedValue([
      {
        type: ExceptionType.UPC_NOT_MATCHED,
        status: ExceptionStatus.OPEN,
        _count: { _all: 2 },
      },
      {
        type: ExceptionType.IMEI_DUPLICATED,
        status: ExceptionStatus.RESOLVED,
        _count: { _all: 1 },
      },
    ]),
    findById: jest.fn().mockResolvedValue(exceptionRecord),
    transition: jest.fn().mockResolvedValue({
      ...exceptionRecord,
      status: ExceptionStatus.RESOLVED,
      resolutionNote: 'Handled after review.',
      resolvedById: user.id,
      resolvedAt: now,
    }),
    ...repositoryOverrides,
  } as unknown as jest.Mocked<ExceptionsRepository>;

  return {
    repository,
    service: new ExceptionsService(repository),
  };
}

describe('ExceptionsService', () => {
  it('lists exceptions with pagination and display titles', async () => {
    const { repository, service } = createService();

    await expect(
      service.list({ page: 1, pageSize: 20, sortOrder: 'desc', status: ExceptionStatus.OPEN }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          id: 'exception-1',
          type: ExceptionType.UPC_NOT_MATCHED,
          typeTitle: 'UPC 未匹配',
          status: ExceptionStatus.OPEN,
        },
      ],
    });
    expect(repository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: ExceptionStatus.OPEN }),
      }),
    );
  });

  it('returns summary counts by type and status', async () => {
    const { service } = createService();

    await expect(
      service.summary({ page: 1, pageSize: 20, sortOrder: 'desc' }),
    ).resolves.toMatchObject({
      total: 3,
      openTotal: 2,
      byType: {
        [ExceptionType.UPC_NOT_MATCHED]: 2,
        [ExceptionType.IMEI_DUPLICATED]: 1,
      },
      byStatus: {
        [ExceptionStatus.OPEN]: 2,
        [ExceptionStatus.RESOLVED]: 1,
      },
    });
  });

  it('resolves an open exception and records the operator', async () => {
    const { repository, service } = createService();

    await expect(
      service.resolve('exception-1', { resolutionNote: ' Handled after review. ' }, user),
    ).resolves.toMatchObject({
      id: 'exception-1',
      status: ExceptionStatus.RESOLVED,
      resolutionNote: 'Handled after review.',
      resolvedById: user.id,
    });
    expect(repository.transition).toHaveBeenCalledWith({
      id: 'exception-1',
      status: ExceptionStatus.RESOLVED,
      resolutionNote: 'Handled after review.',
      operatorId: user.id,
    });
  });

  it('blocks repeated handling once the exception is no longer open', async () => {
    const { service } = createService({
      findById: jest.fn().mockResolvedValue({
        ...exceptionRecord,
        status: ExceptionStatus.RESOLVED,
      }),
    });

    await expect(
      service.ignore('exception-1', { resolutionNote: 'Already handled.' }, user),
    ).rejects.toThrow(ConflictException);
  });

  it('returns not found for unknown exception detail', async () => {
    const { service } = createService({
      findById: jest.fn().mockResolvedValue(null),
    });

    await expect(service.get('missing')).rejects.toThrow(NotFoundException);
  });

  it('keeps one result per exception during batch handling', async () => {
    const { service } = createService({
      findById: jest
        .fn()
        .mockResolvedValueOnce(exceptionRecord)
        .mockResolvedValueOnce({
          ...exceptionRecord,
          id: 'exception-2',
          status: ExceptionStatus.IGNORED,
        }),
    });

    await expect(
      service.batchResolve(
        { ids: ['exception-1', 'exception-2'], resolutionNote: 'Batch reviewed.' },
        user,
      ),
    ).resolves.toMatchObject({
      requestedCount: 2,
      processedCount: 1,
      failedCount: 1,
      results: [
        { id: 'exception-1', success: true },
        { id: 'exception-2', success: false },
      ],
    });
  });
});
