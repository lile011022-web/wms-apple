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
    const products = [];

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

      products.push(await this.toCreateInput(row, { skipUpcAvailabilityCheck: true }));
    }

    for (const sku of seenSkus) {
      await this.assertSkuAvailable(sku);
    }
    await this.assertUpcsAvailable([...seenUpcs]);

    const importedProducts = await this.productsRepository.importProducts(products);

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.UPC_PRODUCT_CHANGE,
      resourceType: 'product-import',
      metadata: {
        importedCount: importedProducts.length,
        productIds: importedProducts.map((product) => product.id),
      },
      afterSnapshot: importedProducts.map((product) => this.toAuditSnapshot(product)),
    });

    return {
      importedCount: importedProducts.length,
      items: importedProducts.map((product) => this.toProductResponse(product)),
    };
  }

  private async toCreateInput(
    dto: CreateProductDto,
    options?: { skipUpcAvailabilityCheck?: boolean },
  ) {
    const sku = this.normalizeSku(dto.sku);
    await this.assertSkuAvailable(sku);
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
