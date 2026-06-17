/* global jest */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CustomerStatus, InventoryStatus, OutboundBoxStatus, ProductStatus } from '@prisma/client';
import { InventoryService } from '../../inventory/inventory.service';
import { OutboundRepository } from '../outbound.repository';
import { OutboundService } from '../outbound.service';

const now = new Date('2026-06-17T00:00:00Z');
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
const user = {
  id: 'user-1',
  email: 'operator@wms-scan.local',
  name: 'Outbound Operator',
  roles: ['ADMIN'],
  permissions: ['outbound.manage'],
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
  upcs: [],
};
const inventoryItem = {
  id: 'inventory-1',
  customerId: customer.id,
  warehouseId: warehouse.id,
  productId: product.id,
  inboundBatchId: 'batch-1',
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
  customer,
  warehouse,
  product,
  outboundBoxItems: [],
};

const emptyBox = {
  id: 'box-1',
  boxNo: 'BOX-001',
  customerId: customer.id,
  warehouseId: warehouse.id,
  createdById: user.id,
  status: OutboundBoxStatus.OPEN,
  sealedAt: null,
  notes: null,
  createdAt: now,
  updatedAt: now,
  customer,
  warehouse,
  createdBy: {
    id: user.id,
    email: user.email,
    name: user.name,
  },
  items: [],
};

const boxItem = {
  id: 'box-item-1',
  outboundBoxId: emptyBox.id,
  inventoryItemId: inventoryItem.id,
  packedAt: now,
  createdAt: now,
  inventoryItem: {
    ...inventoryItem,
    status: InventoryStatus.PACKED,
    packedAt: now,
  },
};

function createService(
  repositoryOverrides: Partial<Record<keyof OutboundRepository, jest.Mock>> = {},
  inventoryOverrides: Partial<Record<keyof InventoryService, jest.Mock>> = {},
) {
  const repository = {
    findCustomerById: jest.fn().mockResolvedValue(customer),
    findWarehouseById: jest.fn().mockResolvedValue(warehouse),
    findBoxByNo: jest.fn().mockResolvedValue(null),
    createBox: jest.fn().mockResolvedValue(emptyBox),
    findBoxById: jest.fn().mockResolvedValue(emptyBox),
    findBoxes: jest.fn().mockResolvedValue([1, [emptyBox]]),
    findInventoryItemById: jest.fn().mockResolvedValue(inventoryItem),
    addItemToBox: jest.fn().mockResolvedValue({ ...emptyBox, items: [boxItem] }),
    removeItemFromBox: jest.fn().mockResolvedValue({
      deleted: boxItem,
      box: emptyBox,
    }),
    clearBoxItems: jest.fn().mockResolvedValue({ clearedCount: 1, box: emptyBox }),
    sealBox: jest.fn().mockResolvedValue({
      ...emptyBox,
      status: OutboundBoxStatus.SEALED,
      sealedAt: now,
      items: [boxItem],
    }),
    ...repositoryOverrides,
  } as unknown as jest.Mocked<OutboundRepository>;
  const inventoryService = {
    listAvailableForOutbound: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20 }),
    ...inventoryOverrides,
  } as unknown as jest.Mocked<InventoryService>;

  return {
    repository,
    inventoryService,
    service: new OutboundService(repository, inventoryService),
  };
}

describe('OutboundService', () => {
  it('requires customer and warehouse when creating a box', async () => {
    const { service } = createService();

    await expect(service.createBox({}, user)).rejects.toThrow(BadRequestException);
    await expect(service.createBox({ customerId: customer.id }, user)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates an open box for an active customer and warehouse', async () => {
    const { repository, service } = createService();

    await expect(
      service.createBox(
        {
          customerId: customer.id,
          warehouseId: warehouse.id,
          boxNo: ' box-001 ',
        },
        user,
      ),
    ).resolves.toMatchObject({
      id: 'box-1',
      boxNo: 'BOX-001',
      status: OutboundBoxStatus.OPEN,
      customer: { id: customer.id },
      warehouse: { id: warehouse.id },
    });
    expect(repository.findBoxByNo).toHaveBeenCalledWith(warehouse.id, 'BOX-001');
  });

  it('delegates outbound availability to inventory with a forced customer and in-stock status', async () => {
    const { inventoryService, service } = createService();

    await service.listAvailableItems({
      customerId: customer.id,
      search: 'iPhone',
      page: 1,
      pageSize: 20,
      sortOrder: 'asc',
    });

    expect(inventoryService.listAvailableForOutbound).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: customer.id,
        status: InventoryStatus.IN_STOCK,
        availableForOutbound: true,
      }),
    );
  });

  it('blocks packing inventory from another customer', async () => {
    const { service } = createService({
      findInventoryItemById: jest.fn().mockResolvedValue({
        ...inventoryItem,
        customerId: 'customer-2',
      }),
    });

    await expect(
      service.addItem(emptyBox.id, { inventoryItemId: inventoryItem.id }),
    ).rejects.toThrow(ConflictException);
  });

  it('blocks inventory that is not in stock or is already packed', async () => {
    const { service } = createService({
      findInventoryItemById: jest.fn().mockResolvedValue({
        ...inventoryItem,
        status: InventoryStatus.EXCEPTION,
      }),
    });

    await expect(
      service.addItem(emptyBox.id, { inventoryItemId: inventoryItem.id }),
    ).rejects.toThrow(ConflictException);

    const packedService = createService({
      findInventoryItemById: jest.fn().mockResolvedValue({
        ...inventoryItem,
        outboundBoxItems: [{ id: 'existing-box-item', outboundBox: { id: 'box-2' } }],
      }),
    }).service;

    await expect(
      packedService.addItem(emptyBox.id, { inventoryItemId: inventoryItem.id }),
    ).rejects.toThrow(ConflictException);
  });

  it('adds and removes items from an open box', async () => {
    const { repository, service } = createService({
      findBoxById: jest
        .fn()
        .mockResolvedValueOnce(emptyBox)
        .mockResolvedValueOnce({ ...emptyBox, items: [boxItem] }),
    });

    await expect(
      service.addItem(emptyBox.id, { inventoryItemId: inventoryItem.id }),
    ).resolves.toMatchObject({
      id: emptyBox.id,
      itemCount: 1,
      items: [{ inventoryItemId: inventoryItem.id }],
    });
    await expect(service.removeItem(emptyBox.id, inventoryItem.id)).resolves.toMatchObject({
      removedItemId: inventoryItem.id,
      box: { id: emptyBox.id, itemCount: 0 },
    });
    expect(repository.addItemToBox).toHaveBeenCalledWith(emptyBox.id, inventoryItem.id);
    expect(repository.removeItemFromBox).toHaveBeenCalledWith(emptyBox.id, inventoryItem.id);
  });

  it('requires at least one item before sealing and then records the seal transaction', async () => {
    const { service } = createService();

    await expect(service.sealBox(emptyBox.id, user)).rejects.toThrow(BadRequestException);

    const ready = createService({
      findBoxById: jest.fn().mockResolvedValue({ ...emptyBox, items: [boxItem] }),
    });
    await expect(ready.service.sealBox(emptyBox.id, user)).resolves.toMatchObject({
      id: emptyBox.id,
      status: OutboundBoxStatus.SEALED,
      itemCount: 1,
    });
    expect(ready.repository.sealBox).toHaveBeenCalledWith({
      boxId: emptyBox.id,
      operatorId: user.id,
    });
  });
});
