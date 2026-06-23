/* global jest */
import { ConflictException } from '@nestjs/common';
import {
  CustomerStatus,
  InboundBatchStatus,
  InboundItemStatus,
  InventoryStatus,
  OutboundBoxStatus,
  ProductStatus,
} from '@prisma/client';
import { SettingsService } from '../../settings/settings.service';
import { CustomerChangeRepository } from '../../customers/customer-change/customer-change.repository';
import { CustomerChangeService } from '../../customers/customer-change/customer-change.service';
import { InboundRepository } from '../../inbound/inbound.repository';
import { InboundService } from '../../inbound/inbound.service';
import { InventoryService } from '../../inventory/inventory.service';
import { OutboundRepository } from '../../outbound/outbound.repository';
import { OutboundService } from '../../outbound/outbound.service';

const now = new Date('2026-06-18T00:00:00Z');
const operator = {
  id: 'user-1',
  email: 'operator@wms-scan.local',
  name: 'Warehouse Operator',
  roles: ['ADMIN'],
  permissions: ['inbound.manage', 'outbound.manage', 'customers.manage'],
};
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
const draft = {
  id: 'draft-1',
  batchNo: 'INB-20260618000000-ABC123',
  customerId: currentCustomer.id,
  warehouseId: warehouse.id,
  operatorId: operator.id,
  status: InboundBatchStatus.DRAFT,
  confirmedAt: null,
  notes: null,
  createdAt: now,
  updatedAt: now,
  customer: currentCustomer,
  warehouse,
  operator,
  inboundItems: [],
  inventoryItems: [],
};
const inventoryItem = {
  id: 'inventory-1',
  customerId: currentCustomer.id,
  warehouseId: warehouse.id,
  productId: product.id,
  inboundBatchId: draft.id,
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
  product,
  outboundBoxItems: [],
};
const confirmedInboundItem = {
  id: 'item-1',
  inboundBatchId: draft.id,
  customerId: currentCustomer.id,
  productId: product.id,
  inventoryItemId: inventoryItem.id,
  upsTrackingNo: inventoryItem.upsTrackingNo,
  upc: inventoryItem.upc,
  imei: inventoryItem.imei,
  serial: null,
  status: InboundItemStatus.CONFIRMED,
  scannedAt: now,
  createdAt: now,
  updatedAt: now,
  inboundBatch: {
    ...draft,
    status: InboundBatchStatus.CONFIRMED,
    confirmedAt: now,
    operator: {
      id: operator.id,
      email: operator.email,
      name: operator.name,
    },
  },
  customer: currentCustomer,
  product,
  exceptions: [],
  inventoryItem,
};
const settings = {
  warehouse: { defaultWarehouseId: warehouse.id },
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

describe('Core inbound, outbound, and customer-change workflow', () => {
  it('keeps customer ownership consistent from inbound confirmation through outbound packing', async () => {
    const inboundRepository = {
      findCustomerById: jest.fn().mockResolvedValue(currentCustomer),
      findWarehouseById: jest.fn().mockResolvedValue(warehouse),
      createDraft: jest.fn().mockResolvedValue(draft),
      findDraftById: jest
        .fn()
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce({
          ...draft,
          inboundItems: [
            {
              ...confirmedInboundItem,
              status: InboundItemStatus.PENDING,
              inventoryItemId: null,
              inventoryItem: null,
            },
          ],
        }),
      findProductByUpc: jest.fn().mockResolvedValue({ ...product.upcs[0], product }),
      findInventoryByImei: jest.fn().mockResolvedValue(null),
      findInventoryBySerial: jest.fn().mockResolvedValue(null),
      countConfirmedItemsByUps: jest.fn().mockResolvedValue(0),
      createItem: jest.fn().mockResolvedValue({
        ...confirmedInboundItem,
        status: InboundItemStatus.PENDING,
        inventoryItemId: null,
        inventoryItem: null,
      }),
      confirmDraft: jest.fn().mockResolvedValue({
        ...draft,
        status: InboundBatchStatus.CONFIRMED,
        confirmedAt: now,
        inboundItems: [confirmedInboundItem],
      }),
    } as unknown as jest.Mocked<InboundRepository>;
    const inboundService = new InboundService(inboundRepository, {
      getSettings: jest.fn().mockResolvedValue(settings),
    } as unknown as SettingsService);

    const createdDraft = await inboundService.createDraft(
      { customerId: currentCustomer.id, warehouseId: warehouse.id },
      operator,
    );
    const scannedItem = await inboundService.addItem(createdDraft.id, {
      upc: inventoryItem.upc,
      imei: inventoryItem.imei,
      upsTrackingNo: inventoryItem.upsTrackingNo,
    });
    const confirmedDraft = await inboundService.confirmDraft(createdDraft.id, operator);

    expect(scannedItem).toMatchObject({
      status: InboundItemStatus.PENDING,
      customer: { id: currentCustomer.id },
      product: { id: product.id },
    });
    expect(confirmedDraft).toMatchObject({
      status: InboundBatchStatus.CONFIRMED,
      summary: { confirmedItems: 1 },
    });
    expect(inboundRepository.confirmDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: draft.id,
        operatorId: operator.id,
      }),
    );

    const boxItem = {
      id: 'box-item-1',
      outboundBoxId: 'box-1',
      inventoryItemId: inventoryItem.id,
      packedAt: now,
      createdAt: now,
      inventoryItem: {
        ...inventoryItem,
        status: InventoryStatus.PACKED,
        packedAt: now,
      },
    };
    const openBox = {
      id: 'box-1',
      boxNo: 'BOX-001',
      boxName: 'Current Customer20260617箱1',
      sizePreset: '12*12*12',
      customSize: null,
      weightLb: 45,
      shippingTrackingNo: null,
      customerId: currentCustomer.id,
      warehouseId: warehouse.id,
      createdById: operator.id,
      status: OutboundBoxStatus.OPEN,
      sealedAt: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
      customer: currentCustomer,
      warehouse,
      createdBy: {
        id: operator.id,
        email: operator.email,
        name: operator.name,
      },
      items: [],
      photos: [],
    };
    const boxPhoto = {
      id: 'photo-1',
      outboundBoxId: openBox.id,
      uploadedById: operator.id,
      fileName: 'BOX-001-photo.jpg',
      originalName: 'packing-photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024,
      storagePath: 'uploads/outbound-box-photos/BOX-001-photo.jpg',
      fileUrl: '/uploads/outbound-box-photos/BOX-001-photo.jpg',
      createdAt: now,
      uploadedBy: {
        id: operator.id,
        email: operator.email,
        name: operator.name,
      },
    };
    const outboundRepository = {
      findCustomerById: jest.fn().mockResolvedValue(currentCustomer),
      findWarehouseById: jest.fn().mockResolvedValue(warehouse),
      findBoxByNo: jest.fn().mockResolvedValue(null),
      findBoxByName: jest.fn().mockResolvedValue(null),
      findLatestBoxByPrefix: jest.fn().mockResolvedValue(null),
      createBox: jest.fn().mockResolvedValue(openBox),
      createBoxWithAudit: jest.fn().mockResolvedValue(openBox),
      findBoxById: jest
        .fn()
        .mockResolvedValueOnce(openBox)
        .mockResolvedValueOnce({ ...openBox, items: [boxItem], photos: [boxPhoto] }),
      findInventoryItemById: jest.fn().mockResolvedValue(inventoryItem),
      addItemToBox: jest.fn().mockResolvedValue({ ...openBox, items: [boxItem] }),
      sealBox: jest.fn().mockResolvedValue({
        ...openBox,
        status: OutboundBoxStatus.SEALED,
        sealedAt: now,
        items: [boxItem],
        photos: [boxPhoto],
      }),
    } as unknown as jest.Mocked<OutboundRepository>;
    const outboundService = new OutboundService(outboundRepository, {
      listAvailableForOutbound: jest.fn(),
    } as unknown as InventoryService);

    const box = await outboundService.createBox(
      { customerId: currentCustomer.id, warehouseId: warehouse.id },
      operator,
    );
    await expect(
      outboundService.addItem(box.id, { inventoryItemId: inventoryItem.id }, operator),
    ).resolves.toMatchObject({
      customer: { id: currentCustomer.id },
      itemCount: 1,
      items: [{ inventoryItemId: inventoryItem.id }],
    });
    await expect(outboundService.sealBox(box.id, operator)).resolves.toMatchObject({
      status: OutboundBoxStatus.SEALED,
      itemCount: 1,
    });
  });

  it('blocks customer reassignment after the item has entered outbound flow', async () => {
    const repository = {
      findCustomerById: jest.fn((id: string) =>
        Promise.resolve(id === currentCustomer.id ? currentCustomer : newCustomer),
      ),
      findItemsByIds: jest.fn().mockResolvedValue([
        {
          ...confirmedInboundItem,
          inventoryItem: {
            ...inventoryItem,
            status: InventoryStatus.PACKED,
            outboundBoxItems: [{ id: 'box-item-1', outboundBox: { id: 'box-1' } }],
          },
        },
      ]),
    } as unknown as jest.Mocked<CustomerChangeRepository>;
    const customerChangeService = new CustomerChangeService(repository);

    const preview = await customerChangeService.preview({
      currentCustomerId: currentCustomer.id,
      newCustomerId: newCustomer.id,
      inboundItemIds: [confirmedInboundItem.id],
    });

    expect(preview).toMatchObject({
      canCommit: false,
      blockedCount: 1,
      blockedItems: [{ id: confirmedInboundItem.id, inventoryStatus: InventoryStatus.PACKED }],
    });
    await expect(
      customerChangeService.commit(
        {
          currentCustomerId: currentCustomer.id,
          newCustomerId: newCustomer.id,
          inboundItemIds: [confirmedInboundItem.id],
          reason: 'Wrong customer selected during receiving.',
          previewToken: preview.previewToken,
        },
        operator,
      ),
    ).rejects.toThrow(ConflictException);
  });
});
