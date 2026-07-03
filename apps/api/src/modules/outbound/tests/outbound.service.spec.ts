/* global jest */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { CustomerStatus, InventoryStatus, OutboundBoxStatus, ProductStatus } from '@prisma/client';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
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
  boxName: null,
  sizePreset: '12*12*12',
  customSize: null,
  weightLb: 45,
  shippingTrackingNo: null,
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
  photos: [],
};

const boxPhoto = {
  id: 'photo-1',
  outboundBoxId: emptyBox.id,
  uploadedById: user.id,
  fileName: 'BOX-001-photo.jpg',
  originalName: 'packing-photo.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1024,
  storagePath: 'uploads/outbound-box-photos/BOX-001-photo.jpg',
  fileUrl: '/uploads/outbound-box-photos/BOX-001-photo.jpg',
  createdAt: now,
  uploadedBy: {
    id: user.id,
    email: user.email,
    name: user.name,
  },
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
    findBoxByName: jest.fn().mockResolvedValue(null),
    findLatestBoxByPrefix: jest.fn().mockResolvedValue(null),
    createBox: jest.fn().mockResolvedValue(emptyBox),
    createBoxWithAudit: jest.fn().mockResolvedValue(emptyBox),
    findBoxById: jest.fn().mockResolvedValue(emptyBox),
    findBoxes: jest.fn().mockResolvedValue([1, [emptyBox]]),
    updateBoxWithAudit: jest.fn().mockResolvedValue(emptyBox),
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
      photos: [boxPhoto],
    }),
    reopenBox: jest.fn().mockResolvedValue({ ...emptyBox, items: [boxItem] }),
    voidBox: jest.fn().mockResolvedValue({ ...emptyBox, status: OutboundBoxStatus.VOIDED }),
    addPhotoToBox: jest.fn().mockResolvedValue({ ...emptyBox, photos: [boxPhoto] }),
    removePhotoFromBox: jest.fn().mockResolvedValue({
      photo: boxPhoto,
      box: emptyBox,
    }),
    findPhotoById: jest.fn().mockResolvedValue(boxPhoto),
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
  it('filters box lists by status and created date range', async () => {
    const { repository, service } = createService();

    await service.listBoxes({
      customerId: customer.id,
      warehouseId: warehouse.id,
      status: OutboundBoxStatus.OPEN,
      createdFrom: '2026-06-17T07:00:00.000Z',
      createdTo: '2026-06-18T06:59:59.999Z',
      page: 1,
      pageSize: 20,
      sortOrder: 'desc',
    });

    expect(repository.findBoxes).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: customer.id,
          warehouseId: warehouse.id,
          status: OutboundBoxStatus.OPEN,
          createdAt: {
            gte: new Date('2026-06-17T07:00:00.000Z'),
            lte: new Date('2026-06-18T06:59:59.999Z'),
          },
        }),
      }),
    );
  });

  it('requires customer and warehouse when creating a box', async () => {
    const { service } = createService();

    await expect(service.createBox({}, user)).rejects.toThrow(BadRequestException);
    await expect(service.createBox({ customerId: customer.id }, user)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates an open box for an active customer and warehouse', async () => {
    jest.useFakeTimers().setSystemTime(now);
    try {
      const generatedBox = {
        ...emptyBox,
        boxNo: 'BOX-CUST-001-20260617-001',
        boxName: 'Apple Reseller20260617箱1',
      };
      const { repository, service } = createService({
        createBoxWithAudit: jest.fn().mockResolvedValue(generatedBox),
      });

      await expect(
        service.createBox(
          {
            customerId: customer.id,
            warehouseId: warehouse.id,
          },
          user,
        ),
      ).resolves.toMatchObject({
        id: 'box-1',
        boxNo: 'BOX-CUST-001-20260617-001',
        boxName: 'Apple Reseller20260617箱1',
        status: OutboundBoxStatus.OPEN,
        customer: { id: customer.id },
        warehouse: { id: warehouse.id },
      });
      expect(repository.findBoxByNo).toHaveBeenCalledWith(
        warehouse.id,
        'BOX-CUST-001-20260617-001',
      );
      expect(repository.createBoxWithAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          boxNo: 'BOX-CUST-001-20260617-001',
          boxName: 'Apple Reseller20260617箱1',
        }),
        user.id,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('blocks duplicate generated box names inside the same warehouse', async () => {
    jest.useFakeTimers().setSystemTime(now);
    const { repository, service } = createService({
      findBoxByName: jest
        .fn()
        .mockResolvedValue({ ...emptyBox, boxName: 'Apple Reseller20260617箱1' }),
    });

    try {
      await expect(
        service.createBox(
          {
            customerId: customer.id,
            warehouseId: warehouse.id,
          },
          user,
        ),
      ).rejects.toThrow(ConflictException);
      expect(repository.findBoxByName).toHaveBeenCalledWith(
        warehouse.id,
        'Apple Reseller20260617箱1',
        undefined,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('creates a box with a custom visible name when provided', async () => {
    jest.useFakeTimers().setSystemTime(now);
    try {
      const createdBox = {
        ...emptyBox,
        boxNo: 'BOX-CUST-001-20260617-001',
        boxName: 'Apple Reseller Custom Box',
      };
      const { repository, service } = createService({
        createBoxWithAudit: jest.fn().mockResolvedValue(createdBox),
      });

      await expect(
        service.createBox(
          {
            customerId: customer.id,
            warehouseId: warehouse.id,
            boxName: '  Apple Reseller Custom Box  ',
          },
          user,
        ),
      ).resolves.toMatchObject({
        boxNo: 'BOX-CUST-001-20260617-001',
        boxName: 'Apple Reseller Custom Box',
      });
      expect(repository.findBoxByName).toHaveBeenCalledWith(
        warehouse.id,
        'Apple Reseller Custom Box',
        undefined,
      );
      expect(repository.createBoxWithAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          boxNo: 'BOX-CUST-001-20260617-001',
          boxName: 'Apple Reseller Custom Box',
        }),
        user.id,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects empty or duplicate custom box names when creating a box', async () => {
    jest.useFakeTimers().setSystemTime(now);
    try {
      const emptyName = createService();
      await expect(
        emptyName.service.createBox(
          {
            customerId: customer.id,
            warehouseId: warehouse.id,
            boxName: '   ',
          },
          user,
        ),
      ).rejects.toThrow('boxName cannot be empty.');

      const duplicateName = createService({
        findBoxByName: jest
          .fn()
          .mockResolvedValue({ ...emptyBox, boxName: 'Apple Reseller Custom Box' }),
      });
      await expect(
        duplicateName.service.createBox(
          {
            customerId: customer.id,
            warehouseId: warehouse.id,
            boxName: 'Apple Reseller Custom Box',
          },
          user,
        ),
      ).rejects.toThrow('当前仓库已存在同名箱子，请修改箱子名称后再保存。');
    } finally {
      jest.useRealTimers();
    }
  });

  it('increments customer-date box numbers and names from the latest created box', async () => {
    jest.useFakeTimers().setSystemTime(now);
    try {
      const generatedBox = {
        ...emptyBox,
        boxNo: 'BOX-CUST-001-20260617-006',
        boxName: 'Apple Reseller20260617箱6',
      };
      const { repository, service } = createService({
        findLatestBoxByPrefix: jest.fn().mockResolvedValue({
          ...emptyBox,
          boxNo: 'BOX-CUST-001-20260617-005',
        }),
        createBoxWithAudit: jest.fn().mockResolvedValue(generatedBox),
      });

      await expect(
        service.createBox(
          {
            customerId: customer.id,
            warehouseId: warehouse.id,
          },
          user,
        ),
      ).resolves.toMatchObject({
        boxNo: 'BOX-CUST-001-20260617-006',
        boxName: 'Apple Reseller20260617箱6',
      });
      expect(repository.findLatestBoxByPrefix).toHaveBeenCalledWith(
        warehouse.id,
        'BOX-CUST-001-20260617-',
      );
      expect(repository.findBoxByNo).toHaveBeenCalledWith(
        warehouse.id,
        'BOX-CUST-001-20260617-006',
      );
      expect(repository.createBoxWithAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          boxNo: 'BOX-CUST-001-20260617-006',
          boxName: 'Apple Reseller20260617箱6',
        }),
        user.id,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('updates an open box name after checking warehouse uniqueness', async () => {
    const renamedBox = {
      ...emptyBox,
      boxName: 'Apple Reseller Custom Box',
      sizePreset: '14*14*14',
      weightLb: 42,
    };
    const { repository, service } = createService({
      updateBoxWithAudit: jest.fn().mockResolvedValue(renamedBox),
    });

    await expect(
      service.updateBox(
        emptyBox.id,
        {
          boxName: '  Apple Reseller Custom Box  ',
          sizePreset: '14*14*14',
          weightLb: 42,
        },
        user,
      ),
    ).resolves.toMatchObject({
      id: emptyBox.id,
      boxName: 'Apple Reseller Custom Box',
      weightLb: 42,
    });
    expect(repository.findBoxByName).toHaveBeenCalledWith(
      warehouse.id,
      'Apple Reseller Custom Box',
      emptyBox.id,
    );
    expect(repository.updateBoxWithAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        boxId: emptyBox.id,
        operatorId: user.id,
        data: expect.objectContaining({
          boxName: 'Apple Reseller Custom Box',
          sizePreset: '14*14*14',
          weightLb: 42,
        }),
      }),
    );
  });

  it('rejects empty or duplicate manual box names', async () => {
    const emptyName = createService();
    await expect(
      emptyName.service.updateBox(emptyBox.id, { boxName: '   ' }, user),
    ).rejects.toThrow(BadRequestException);
    expect(emptyName.repository.updateBoxWithAudit).not.toHaveBeenCalled();

    const duplicateName = createService({
      findBoxByName: jest.fn().mockResolvedValue({ ...emptyBox, id: 'box-2' }),
    });
    await expect(
      duplicateName.service.updateBox(emptyBox.id, { boxName: 'Apple Reseller Custom Box' }, user),
    ).rejects.toThrow('当前仓库已存在同名箱子，请修改箱子名称后再保存。');
    expect(duplicateName.repository.updateBoxWithAudit).not.toHaveBeenCalled();
  });

  it('allows reusing a box name after the previous box is voided', async () => {
    const reusedNameBox = {
      ...emptyBox,
      boxName: 'Apple Reseller Custom Box',
    };
    const { repository, service } = createService({
      findBoxByName: jest.fn().mockResolvedValue(null),
      updateBoxWithAudit: jest.fn().mockResolvedValue(reusedNameBox),
    });

    await expect(
      service.updateBox(emptyBox.id, { boxName: 'Apple Reseller Custom Box' }, user),
    ).resolves.toMatchObject({
      id: emptyBox.id,
      boxName: 'Apple Reseller Custom Box',
    });
    expect(repository.findBoxByName).toHaveBeenCalledWith(
      warehouse.id,
      'Apple Reseller Custom Box',
      emptyBox.id,
    );
    expect(repository.updateBoxWithAudit).toHaveBeenCalled();
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
      service.addItem(emptyBox.id, { inventoryItemId: inventoryItem.id }, user),
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
      service.addItem(emptyBox.id, { inventoryItemId: inventoryItem.id }, user),
    ).rejects.toThrow(ConflictException);

    const packedService = createService({
      findInventoryItemById: jest.fn().mockResolvedValue({
        ...inventoryItem,
        outboundBoxItems: [{ id: 'existing-box-item', outboundBox: { id: 'box-2' } }],
      }),
    }).service;

    await expect(
      packedService.addItem(emptyBox.id, { inventoryItemId: inventoryItem.id }, user),
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
      service.addItem(emptyBox.id, { inventoryItemId: inventoryItem.id }, user),
    ).resolves.toMatchObject({
      id: emptyBox.id,
      itemCount: 1,
      items: [{ inventoryItemId: inventoryItem.id }],
    });
    await expect(service.removeItem(emptyBox.id, inventoryItem.id, user)).resolves.toMatchObject({
      removedItemId: inventoryItem.id,
      box: { id: emptyBox.id, itemCount: 0 },
    });
    expect(repository.addItemToBox).toHaveBeenCalledWith(emptyBox.id, inventoryItem.id, user.id);
    expect(repository.removeItemFromBox).toHaveBeenCalledWith(
      emptyBox.id,
      inventoryItem.id,
      user.id,
    );
  });

  it('requires at least one item and one photo before sealing', async () => {
    const { service } = createService();

    await expect(service.sealBox(emptyBox.id, user)).rejects.toThrow(BadRequestException);

    const withItemsOnly = createService({
      findBoxById: jest.fn().mockResolvedValue({ ...emptyBox, items: [boxItem] }),
    });
    await expect(withItemsOnly.service.sealBox(emptyBox.id, user)).rejects.toThrow(
      BadRequestException,
    );

    const ready = createService({
      findBoxById: jest.fn().mockResolvedValue({
        ...emptyBox,
        items: [boxItem],
        photos: [boxPhoto],
      }),
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

  it('accepts mobile video evidence before sealing', async () => {
    const { repository, service } = createService();

    await expect(
      service.uploadPhoto(
        emptyBox.id,
        {
          originalname: 'packing-video.mov',
          mimetype: 'video/quicktime',
          size: 2048,
          buffer: Buffer.from('video'),
        },
        user,
      ),
    ).resolves.toMatchObject({ id: emptyBox.id });

    const payload = repository.addPhotoToBox.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      boxId: emptyBox.id,
      originalName: 'packing-video.mov',
      mimeType: 'video/quicktime',
      fileSize: 2048,
    });
    if (payload?.storagePath) {
      await unlink(path.join(process.cwd(), payload.storagePath)).catch(() => undefined);
    }
  });

  it('deletes an open box by voiding it and returning the refreshed box', async () => {
    const { repository, service } = createService();

    await expect(service.deleteBox(emptyBox.id, user)).resolves.toMatchObject({
      deletedBoxId: emptyBox.id,
      box: {
        id: emptyBox.id,
        status: OutboundBoxStatus.VOIDED,
      },
    });
    expect(repository.voidBox).toHaveBeenCalledWith({
      boxId: emptyBox.id,
      operatorId: user.id,
    });
  });

  it('blocks deleting sealed boxes until they are reopened', async () => {
    const { repository, service } = createService({
      findBoxById: jest.fn().mockResolvedValue({
        ...emptyBox,
        status: OutboundBoxStatus.SEALED,
        sealedAt: now,
      }),
    });

    await expect(service.deleteBox(emptyBox.id, user)).rejects.toThrow(ConflictException);
    expect(repository.voidBox).not.toHaveBeenCalled();
  });
});
