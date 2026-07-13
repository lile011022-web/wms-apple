import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, ProductStatus } from '@prisma/client';
import { isValidUpc } from '@wms-scan/shared';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ImportProductsDto } from './dto/import-products.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductStatusDto } from './dto/update-product-status.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsRepository } from './products.repository';

type ProductRecord = NonNullable<Awaited<ReturnType<ProductsRepository['findById']>>>;
type ProductUpcRecord = NonNullable<Awaited<ReturnType<ProductsRepository['findByUpc']>>>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async list(query: ListProductsQueryDto) {
    const allowedSortFields = new Set([
      'createdAt',
      'updatedAt',
      'sku',
      'name',
      'category',
      'status',
    ]);
    const sortBy = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'createdAt';
    const [total, products] = await this.productsRepository.findMany({
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      search: query.search,
      status: query.status,
      category: query.category,
      orderBy: { [sortBy]: query.sortOrder } as Prisma.ProductOrderByWithRelationInput,
    });

    return {
      items: products.map((product) => this.toProductResponse(product)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getById(id: string) {
    const product = await this.findExistingProduct(id);
    return this.toProductResponse(product);
  }

  async getByUpc(upc: string) {
    const normalizedUpc = this.normalizeUpc(upc);
    const productUpc = await this.productsRepository.findByUpc(normalizedUpc);
    if (
      !productUpc ||
      productUpc.status !== ProductStatus.ACTIVE ||
      productUpc.product.status !== ProductStatus.ACTIVE
    ) {
      throw new NotFoundException('Active UPC product not found.');
    }

    return this.toProductResponse(productUpc.product, normalizedUpc);
  }

  async create(dto: CreateProductDto, operator: AuthenticatedUser) {
    const data = await this.toCreateInput(dto);
    const product = await this.productsRepository.create(data);

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.UPC_PRODUCT_CHANGE,
      resourceType: 'product',
      resourceId: product.id,
      afterSnapshot: this.toAuditSnapshot(product),
    });

    return this.toProductResponse(product);
  }

  async update(id: string, dto: UpdateProductDto, operator: AuthenticatedUser) {
    const before = await this.findExistingProduct(id);
    const sku = dto.sku ? this.normalizeSku(dto.sku) : undefined;
    if (sku && sku !== before.sku) {
      await this.assertSkuAvailable(sku);
    }

    const data: Prisma.ProductUpdateInput = {
      sku,
      brand: dto.brand === undefined ? undefined : this.trimRequired(dto.brand, 'Brand'),
      name: dto.name === undefined ? undefined : this.trimRequired(dto.name, 'Product name'),
      model: dto.model === undefined ? undefined : this.trimOptional(dto.model),
      modelCode: dto.modelCode === undefined ? undefined : this.trimOptional(dto.modelCode),
      category: dto.category === undefined ? undefined : this.trimOptional(dto.category),
      color: dto.color === undefined ? undefined : this.trimOptional(dto.color),
      capacity: dto.capacity === undefined ? undefined : this.trimOptional(dto.capacity),
      requiresImei: dto.requiresImei,
    };

    if (dto.upcs) {
      const normalizedUpcs = this.normalizeUpcs(dto.upcs);
      await this.assertUpcsAvailable(normalizedUpcs, before.id);
      data.upcs = {
        deleteMany: {},
        create: normalizedUpcs.map((upc) => ({
          upc,
          status: before.status,
        })),
      };
    }

    const after = await this.productsRepository.update(id, data);

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.UPC_PRODUCT_CHANGE,
      resourceType: 'product',
      resourceId: after.id,
      beforeSnapshot: this.toAuditSnapshot(before),
      afterSnapshot: this.toAuditSnapshot(after),
    });

    return this.toProductResponse(after);
  }

  async updateStatus(id: string, dto: UpdateProductStatusDto, operator: AuthenticatedUser) {
    const before = await this.findExistingProduct(id);
    const after = await this.productsRepository.update(id, {
      status: dto.status,
      upcs: {
        updateMany: {
          where: {},
          data: { status: dto.status },
        },
      },
    });

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.UPC_PRODUCT_CHANGE,
      resourceType: 'product',
      resourceId: after.id,
      beforeSnapshot: this.toAuditSnapshot(before),
      afterSnapshot: this.toAuditSnapshot(after),
      metadata: {
        changedFields: ['status'],
      },
    });

    return this.toProductResponse(after);
  }

  async importProducts(dto: ImportProductsDto, operator: AuthenticatedUser) {
    const seenSkus = new Set<string>();
    const seenUpcs = new Set<string>();
    const normalizedRows: Array<{
      row: CreateProductDto;
      sku: string;
      upcs: string[];
      createData: Prisma.ProductCreateInput;
    }> = [];

    for (const row of dto.products) {
      const sku = this.normalizeSku(row.sku);
      if (seenSkus.has(sku)) {
        throw new ConflictException(`Duplicate SKU in import payload: ${sku}.`);
      }
      seenSkus.add(sku);

      const upcs = this.normalizeUpcs(row.upcs);
      for (const upc of upcs) {
        if (seenUpcs.has(upc)) {
          throw new ConflictException(`Duplicate UPC in import payload: ${upc}.`);
        }
        seenUpcs.add(upc);
      }

      normalizedRows.push({
        row,
        sku,
        upcs,
        createData: await this.toCreateInput(row, {
          skipSkuAvailabilityCheck: true,
          skipUpcAvailabilityCheck: true,
        }),
      });
    }

    const existingProducts = await this.productsRepository.findManyBySkus([...seenSkus]);
    const existingBySku = new Map(existingProducts.map((product) => [product.sku, product]));

    if (!dto.updateExisting && existingProducts.length > 0) {
      throw new ConflictException(`Product SKU already exists: ${existingProducts[0]!.sku}.`);
    }

    const existingUpcs = await this.productsRepository.findExistingUpcs([...seenUpcs]);
    for (const existingUpc of existingUpcs) {
      const requestedRow = normalizedRows.find((row) => row.upcs.includes(existingUpc.upc));
      const requestedProduct = requestedRow ? existingBySku.get(requestedRow.sku) : undefined;
      if (!requestedProduct || requestedProduct.id !== existingUpc.productId) {
        throw new ConflictException(`UPC already belongs to another SKU: ${existingUpc.upc}.`);
      }
    }

    const products = normalizedRows.map(({ row, sku, upcs, createData }) => {
      const existing = existingBySku.get(sku);
      if (!existing) {
        return { createData };
      }

      const updateData: Prisma.ProductUpdateInput = {
        brand: this.trimOptional(row.brand) ?? 'Apple',
        name: this.trimRequired(row.name, 'Product name'),
        model: this.trimOptional(row.model) ?? null,
        modelCode: this.trimOptional(row.modelCode) ?? null,
        category: this.trimOptional(row.category) ?? null,
        color: this.trimOptional(row.color) ?? null,
        capacity: this.trimOptional(row.capacity) ?? null,
        requiresImei: row.requiresImei ?? true,
        upcs: {
          deleteMany: {},
          create: upcs.map((upc) => ({ upc, status: existing.status })),
        },
      };
      return { existingProductId: existing.id, createData, updateData };
    });

    const savedProducts = await this.productsRepository.importProducts(products);
    const updatedCount = existingProducts.length;
    const importedCount = savedProducts.length - updatedCount;

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.UPC_PRODUCT_CHANGE,
      resourceType: 'product-import',
      metadata: {
        importedCount,
        updatedCount,
        updateExisting: dto.updateExisting ?? false,
        productIds: savedProducts.map((product) => product.id),
      },
      beforeSnapshot: existingProducts.map((product) => this.toAuditSnapshot(product)),
      afterSnapshot: savedProducts.map((product) => this.toAuditSnapshot(product)),
    });

    return {
      importedCount,
      updatedCount,
      items: savedProducts.map((product) => this.toProductResponse(product)),
    };
  }

  async deleteMany(inputIds: string[], operator: AuthenticatedUser) {
    const ids = [...new Set(inputIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      throw new BadRequestException('Please select at least one product to delete.');
    }

    const products = await this.productsRepository.findManyByIds(ids);
    const foundIds = new Set(products.map((product) => product.id));
    const missingIds = ids.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new NotFoundException(`Product not found: ${missingIds.join(', ')}.`);
    }

    const blockedProducts = products.filter(
      (product) =>
        product._count.inboundItems > 0 ||
        product._count.inventoryItems > 0 ||
        product._count.exceptions > 0,
    );
    if (blockedProducts.length > 0) {
      const blockedSummary = blockedProducts
        .map(
          (product) =>
            `${product.sku}（入库 ${product._count.inboundItems}、库存 ${product._count.inventoryItems}、异常记录 ${product._count.exceptions}）`,
        )
        .join('；');
      throw new ConflictException(`以下商品已有业务记录，不能删除：${blockedSummary}`);
    }

    try {
      const deleted = await this.productsRepository.deleteMany(ids);
      if (deleted.count !== ids.length) {
        throw new ConflictException('商品数据已被其他人修改，请刷新后重试。');
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('商品已被入库、库存或异常记录引用，不能删除。');
      }
      throw error;
    }

    for (const product of products) {
      await this.auditLogsService.record({
        operatorId: operator.id,
        action: AuditAction.UPC_PRODUCT_CHANGE,
        resourceType: 'product',
        resourceId: product.id,
        beforeSnapshot: this.toAuditSnapshot(product),
        metadata: {
          changeType: 'DELETE',
          deletedSku: product.sku,
        },
      });
    }

    return {
      deletedCount: ids.length,
      deletedIds: ids,
    };
  }

  private async toCreateInput(
    dto: CreateProductDto,
    options?: { skipSkuAvailabilityCheck?: boolean; skipUpcAvailabilityCheck?: boolean },
  ) {
    const sku = this.normalizeSku(dto.sku);
    if (!options?.skipSkuAvailabilityCheck) {
      await this.assertSkuAvailable(sku);
    }
    const upcs = this.normalizeUpcs(dto.upcs);
    if (!options?.skipUpcAvailabilityCheck) {
      await this.assertUpcsAvailable(upcs);
    }

    const status = dto.status ?? ProductStatus.ACTIVE;

    return {
      sku,
      brand: this.trimOptional(dto.brand) ?? 'Apple',
      name: this.trimRequired(dto.name, 'Product name'),
      model: this.trimOptional(dto.model),
      modelCode: this.trimOptional(dto.modelCode),
      category: this.trimOptional(dto.category),
      color: this.trimOptional(dto.color),
      capacity: this.trimOptional(dto.capacity),
      requiresImei: dto.requiresImei ?? true,
      status,
      upcs: {
        create: upcs.map((upc) => ({
          upc,
          status,
        })),
      },
    } satisfies Prisma.ProductCreateInput;
  }

  private async findExistingProduct(id: string) {
    const product = await this.productsRepository.findById(id);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return product;
  }

  private async assertSkuAvailable(sku: string) {
    const existingProduct = await this.productsRepository.findBySku(sku);
    if (existingProduct) {
      throw new ConflictException('Product SKU already exists.');
    }
  }

  private async assertUpcsAvailable(upcs: string[], currentProductId?: string) {
    const existingUpcs = await this.productsRepository.findExistingUpcs(upcs);
    const conflictingUpc = existingUpcs.find((record) => record.productId !== currentProductId);
    if (conflictingUpc) {
      throw new ConflictException(`UPC already exists: ${conflictingUpc.upc}.`);
    }
  }

  private normalizeSku(sku: string) {
    return this.trimRequired(sku, 'SKU').toUpperCase();
  }

  private normalizeUpc(upc: string) {
    const normalized = this.trimRequired(upc, 'UPC');
    if (!isValidUpc(normalized)) {
      throw new BadRequestException('Invalid UPC format.');
    }
    return normalized;
  }

  private normalizeUpcs(upcs: string[]) {
    const normalizedUpcs = upcs.map((upc) => this.normalizeUpc(upc));
    const uniqueUpcs = new Set(normalizedUpcs);
    if (uniqueUpcs.size !== normalizedUpcs.length) {
      throw new ConflictException('Duplicate UPC in request.');
    }
    return normalizedUpcs;
  }

  private trimRequired(value: string, label: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} cannot be empty.`);
    }
    return trimmed;
  }

  private trimOptional(value?: string) {
    const trimmed = value?.trim();
    return trimmed || undefined;
  }

  private toProductResponse(
    product: ProductRecord | ProductUpcRecord['product'],
    matchedUpc?: string,
  ) {
    return {
      id: product.id,
      sku: product.sku,
      brand: product.brand,
      name: product.name,
      model: product.model,
      modelCode: product.modelCode,
      category: product.category,
      color: product.color,
      capacity: product.capacity,
      requiresImei: product.requiresImei,
      status: product.status,
      upcs: product.upcs.map((upc) => ({
        id: upc.id,
        upc: upc.upc,
        status: upc.status,
      })),
      matchedUpc,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private toAuditSnapshot(product: ProductRecord | ProductUpcRecord['product']) {
    return this.toProductResponse(product);
  }
}
