/* global jest */
import { BadRequestException } from '@nestjs/common';
import { CustomerStatus, InventoryStatus, ProductStatus } from '@prisma/client';
import { InventoryRepository } from '../inventory.repository';
import { InventoryService } from '../inventory.service';

const operator = {
  id: 'user-1',
  email: 'operator@wms-scan.local',
  name: 'Inventory Operator',
  roles: ['ADMIN'],
  permissions: ['customers.manage', 'inventory.read'],
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

const inventoryItem = {
  id: 'inventory-1',
  customerId: 'customer-1',
  warehouseId: 'warehouse-1',
  productId: 'product-1',
  inboundBatchId: 'batch-1',
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
  customer,
  warehouse,
  product,
  inboundBatch: {
    id: 'batch-1',
    batchNo: 'INB-20260617000000-ABC123',
    confirmedAt: new Date('2026-06-17T00:00:00Z'),
  },
  inboundItem: {
    id: 'inbound-item-1',
    scannedAt: new Date('2026-06-17T00:00:00Z'),
    status: 'CONFIRMED',
  },
  outboundBoxItems: [],
  exceptions: [],
};

function createService(repositoryOverrides: Partial<Record<keyof InventoryRepository, jest.Mock>>) {
  const repository = {
    findCustomerById: jest.fn().mockResolvedValue(customer),
    findProductById: jest.fn().mockResolvedValue(product),
    getCustomerStatusCounts: jest.fn().mockResolvedValue([
      { status: InventoryStatus.IN_STOCK, _count: { _all: 3 } },
      { status: InventoryStatus.OUTBOUND, _count: { _all: 2 } },
      { status: InventoryStatus.EXCEPTION, _count: { _all: 1 } },
    ]),
    getCustomerSkuCount: jest.fn().mockResolvedValue([{ productId: 'product-1' }]),
    findProductSummaries: jest.fn().mockResolvedValue({
      total: 1,
      products: [product],
      statusCounts: [
        { productId: 'product-1', status: InventoryStatus.IN_STOCK, _count: { _all: 3 } },
        { productId: 'product-1', status: InventoryStatus.OUTBOUND, _count: { _all: 2 } },
      ],
      trackingRows: [
        {
          productId: 'product-1',
          upsTrackingNo: '1Z999AA10123456784',
        },
        {
          productId: 'product-1',
          upsTrackingNo: '1ZBBTEST0000000100',
        },
      ],
    }),
    findItems: jest.fn().mockResolvedValue([1, [inventoryItem]]),
    countItems: jest.fn().mockResolvedValue(1),
    findItemById: jest.fn().mockResolvedValue(inventoryItem),
    deleteProducts: jest.fn().mockResolvedValue({
      deletedInventoryItems: 3,
      deletedOutboundBoxItems: 1,
      clearedInboundLinks: 3,
      clearedExceptionLinks: 0,
    }),
    toSearchWhere: jest.fn().mockReturnValue(undefined),
    toOutboundAvailableWhere: jest.fn().mockReturnValue({ status: InventoryStatus.IN_STOCK }),
    ...repositoryOverrides,
  } as unknown as jest.Mocked<InventoryRepository>;

  return {
    repository,
    service: new InventoryService(repository),
  };
}

describe('InventoryService', () => {
  it('requires a customer before returning customer inventory summary', async () => {
    const { service } = createService({});

    await expect(service.getCustomerSummary({})).rejects.toThrow(BadRequestException);
  });

  it('summarizes only the selected customer inventory', async () => {
    const { repository, service } = createService({});

    await expect(service.getCustomerSummary({ customerId: 'customer-1' })).resolves.toMatchObject({
      customerId: 'customer-1',
      totalQuantity: 6,
      skuCount: 1,
      inStockQuantity: 3,
      outboundQuantity: 2,
      exceptionQuantity: 1,
      availableForOutboundQuantity: 3,
    });
    expect(repository.getCustomerStatusCounts).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'customer-1' }),
    );
  });

  it('returns SKU summaries with inventory state counts', async () => {
    const { service } = createService({});

    await expect(
      service.listProducts({ customerId: 'customer-1', page: 1, pageSize: 20, sortOrder: 'asc' }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          product: { id: 'product-1', sku: 'IPHONE-16-PRO-256-NAT' },
          summary: {
            totalQuantity: 5,
            inStockQuantity: 3,
            outboundQuantity: 2,
            availableForOutboundQuantity: 3,
          },
          trackingNumberCount: 2,
        },
      ],
    });
  });

  it('keeps exception inventory out of outbound availability', async () => {
    const { repository, service } = createService({});

    await service.listAvailableForOutbound({
      customerId: 'customer-1',
      page: 1,
      pageSize: 20,
      sortOrder: 'asc',
    });

    expect(repository.findItems).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: 'customer-1',
          status: InventoryStatus.IN_STOCK,
        }),
      }),
    );
  });

  it('paginates IMEI detail rows', async () => {
    const { repository, service } = createService({});

    await expect(
      service.listItems({
        customerId: 'customer-1',
        search: '356789012345678',
        page: 2,
        pageSize: 10,
        sortOrder: 'desc',
      }),
    ).resolves.toMatchObject({
      page: 2,
      pageSize: 10,
      total: 1,
      items: [{ id: 'inventory-1', imei: '356789012345678', availableForOutbound: true }],
    });
    expect(repository.findItems).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    );
  });

  it('builds customer inventory search across visible detail columns', () => {
    const repository = new InventoryRepository({} as never);

    expect(repository.toSearchWhere('BOX-BB0001')).toEqual({
      OR: expect.arrayContaining([
        { upc: { contains: 'BOX-BB0001' } },
        { imei: { contains: 'BOX-BB0001' } },
        { serial: { contains: 'BOX-BB0001', mode: 'insensitive' } },
        { upsTrackingNo: { contains: 'BOX-BB0001', mode: 'insensitive' } },
        { inboundBatch: { batchNo: { contains: 'BOX-BB0001', mode: 'insensitive' } } },
        {
          outboundBoxItems: {
            some: {
              outboundBox: {
                OR: [
                  { boxNo: { contains: 'BOX-BB0001', mode: 'insensitive' } },
                  { boxName: { contains: 'BOX-BB0001', mode: 'insensitive' } },
                ],
              },
            },
          },
        },
        { product: { sku: { contains: 'BOX-BB0001', mode: 'insensitive' } } },
        { product: { name: { contains: 'BOX-BB0001', mode: 'insensitive' } } },
      ]),
    });
  });

  it('deletes selected customer inventory products', async () => {
    const { repository, service } = createService({});

    await expect(
      service.deleteProducts(
        {
          customerId: ' customer-1 ',
          warehouseId: ' warehouse-1 ',
          productIds: ['product-1', 'product-1', ' product-2 '],
        },
        operator,
      ),
    ).resolves.toMatchObject({
      deletedInventoryItems: 3,
      deletedOutboundBoxItems: 1,
    });
    expect(repository.deleteProducts).toHaveBeenCalledWith({
      customerId: 'customer-1',
      warehouseId: 'warehouse-1',
      productIds: ['product-1', 'product-2'],
      operator,
    });
  });

  it('rejects product deletion without selected products', async () => {
    const { service } = createService({});

    await expect(
      service.deleteProducts({ customerId: 'customer-1', productIds: [' '] }, operator),
    ).rejects.toThrow(BadRequestException);
  });
});
