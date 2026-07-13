/* global jest */
import { AuditAction, ProductStatus } from '@prisma/client';
import { ProductsRepository } from '../products.repository';
import { ProductsService } from '../products.service';

const operator = {
  id: 'user-1',
  sessionId: 'session-test',
  email: 'admin@wms-scan.local',
  name: 'Admin',
  roles: ['ADMIN'],
  permissions: ['products.manage'],
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

describe('ProductsService', () => {
  it('normalizes SKU and UPC values and writes audit log on create', async () => {
    const productsRepository = {
      findBySku: jest.fn().mockResolvedValue(null),
      findExistingUpcs: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(product),
    } as unknown as jest.Mocked<ProductsRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new ProductsService(productsRepository, auditLogsService as never);

    await expect(
      service.create(
        {
          sku: ' iphone-16-pro-256-nat ',
          name: ' iPhone 16 Pro 256GB Natural Titanium ',
          upcs: ['194253149189'],
        },
        operator,
      ),
    ).resolves.toMatchObject({
      id: 'product-1',
      sku: 'IPHONE-16-PRO-256-NAT',
      status: ProductStatus.ACTIVE,
      upcs: [{ upc: '194253149189' }],
    });

    expect(productsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: 'IPHONE-16-PRO-256-NAT',
        brand: 'Apple',
        requiresImei: true,
        status: ProductStatus.ACTIVE,
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'user-1',
        action: AuditAction.UPC_PRODUCT_CHANGE,
        resourceType: 'product',
        resourceId: 'product-1',
      }),
    );
  });

  it('only resolves active UPC mappings for inbound scan lookup', async () => {
    const productsRepository = {
      findByUpc: jest.fn().mockResolvedValue({
        id: 'upc-1',
        upc: '194253149189',
        productId: 'product-1',
        status: ProductStatus.ACTIVE,
        createdAt: new Date('2026-06-17T00:00:00Z'),
        updatedAt: new Date('2026-06-17T00:00:00Z'),
        product,
      }),
    } as unknown as jest.Mocked<ProductsRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new ProductsService(productsRepository, auditLogsService as never);

    await expect(service.getByUpc('194253149189')).resolves.toMatchObject({
      id: 'product-1',
      matchedUpc: '194253149189',
      requiresImei: true,
    });
  });

  it('cascades product status to UPC mappings and writes audit log', async () => {
    const inactiveProduct = {
      ...product,
      status: ProductStatus.INACTIVE,
      upcs: product.upcs.map((upc) => ({ ...upc, status: ProductStatus.INACTIVE })),
    };
    const productsRepository = {
      findById: jest.fn().mockResolvedValue(product),
      update: jest.fn().mockResolvedValue(inactiveProduct),
    } as unknown as jest.Mocked<ProductsRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new ProductsService(productsRepository, auditLogsService as never);

    await expect(
      service.updateStatus('product-1', { status: ProductStatus.INACTIVE }, operator),
    ).resolves.toMatchObject({
      id: 'product-1',
      status: ProductStatus.INACTIVE,
      upcs: [{ status: ProductStatus.INACTIVE }],
    });

    expect(productsRepository.update).toHaveBeenCalledWith(
      'product-1',
      expect.objectContaining({
        status: ProductStatus.INACTIVE,
        upcs: expect.objectContaining({
          updateMany: expect.objectContaining({
            data: { status: ProductStatus.INACTIVE },
          }),
        }),
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPC_PRODUCT_CHANGE,
        beforeSnapshot: expect.objectContaining({ status: ProductStatus.ACTIVE }),
        afterSnapshot: expect.objectContaining({ status: ProductStatus.INACTIVE }),
      }),
    );
  });

  it('updates an existing product by SKU when overwrite import is enabled', async () => {
    const updatedProduct = {
      ...product,
      name: 'iPhone 16 Pro 256GB Natural Titanium Updated',
    };
    const productsRepository = {
      findManyBySkus: jest.fn().mockResolvedValue([product]),
      findExistingUpcs: jest
        .fn()
        .mockResolvedValue([{ upc: '194253149189', productId: product.id }]),
      importProducts: jest.fn().mockResolvedValue([updatedProduct]),
    } as unknown as jest.Mocked<ProductsRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new ProductsService(productsRepository, auditLogsService as never);

    await expect(
      service.importProducts(
        {
          updateExisting: true,
          products: [
            {
              sku: product.sku,
              name: updatedProduct.name,
              upcs: ['194253149189'],
            },
          ],
        },
        operator,
      ),
    ).resolves.toMatchObject({ importedCount: 0, updatedCount: 1 });

    expect(productsRepository.importProducts).toHaveBeenCalledWith([
      expect.objectContaining({
        existingProductId: product.id,
        updateData: expect.objectContaining({
          name: updatedProduct.name,
          upcs: expect.objectContaining({ deleteMany: {} }),
        }),
      }),
    ]);
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ importedCount: 0, updatedCount: 1 }),
        beforeSnapshot: [expect.objectContaining({ sku: product.sku })],
      }),
    );
  });

  it('rejects overwrite import when a UPC belongs to another SKU', async () => {
    const productsRepository = {
      findManyBySkus: jest.fn().mockResolvedValue([product]),
      findExistingUpcs: jest
        .fn()
        .mockResolvedValue([{ upc: '195949000001', productId: 'another-product' }]),
      importProducts: jest.fn(),
    } as unknown as jest.Mocked<ProductsRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new ProductsService(productsRepository, auditLogsService as never);

    await expect(
      service.importProducts(
        {
          updateExisting: true,
          products: [
            {
              sku: product.sku,
              name: product.name,
              upcs: ['195949000001'],
            },
          ],
        },
        operator,
      ),
    ).rejects.toThrow('UPC already belongs to another SKU');

    expect(productsRepository.importProducts).not.toHaveBeenCalled();
    expect(auditLogsService.record).not.toHaveBeenCalled();
  });

  it('deletes an unused product and records the deleted snapshot', async () => {
    const productsRepository = {
      findManyByIds: jest.fn().mockResolvedValue([
        {
          ...product,
          _count: { inboundItems: 0, inventoryItems: 0, exceptions: 0 },
        },
      ]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    } as unknown as jest.Mocked<ProductsRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new ProductsService(productsRepository, auditLogsService as never);

    await expect(service.deleteMany([product.id], operator)).resolves.toEqual({
      deletedCount: 1,
      deletedIds: [product.id],
    });
    expect(productsRepository.deleteMany).toHaveBeenCalledWith([product.id]);
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPC_PRODUCT_CHANGE,
        resourceId: product.id,
        beforeSnapshot: expect.objectContaining({ sku: product.sku }),
        metadata: expect.objectContaining({ changeType: 'DELETE' }),
      }),
    );
  });

  it('rejects the whole deletion when any selected product has business history', async () => {
    const productsRepository = {
      findManyByIds: jest.fn().mockResolvedValue([
        {
          ...product,
          _count: { inboundItems: 1, inventoryItems: 1, exceptions: 0 },
        },
      ]),
      deleteMany: jest.fn(),
    } as unknown as jest.Mocked<ProductsRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new ProductsService(productsRepository, auditLogsService as never);

    await expect(service.deleteMany([product.id], operator)).rejects.toThrow(
      '以下商品已有业务记录，不能删除',
    );
    expect(productsRepository.deleteMany).not.toHaveBeenCalled();
    expect(auditLogsService.record).not.toHaveBeenCalled();
  });
});
