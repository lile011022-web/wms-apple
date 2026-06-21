import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryStatus, Prisma } from '@prisma/client';
import { InventoryCustomerSummaryQueryDto } from './dto/inventory-customer-summary-query.dto';
import { ListInventoryItemsQueryDto } from './dto/list-inventory-items-query.dto';
import { ListInventoryProductsQueryDto } from './dto/list-inventory-products-query.dto';
import { InventoryItemRecord, InventoryRepository } from './inventory.repository';

@Injectable()
export class InventoryService {
  constructor(private readonly inventoryRepository: InventoryRepository) {}

  async getCustomerSummary(query: InventoryCustomerSummaryQueryDto) {
    const customerId = await this.requireCustomerId(query.customerId);
    await this.findExistingCustomer(customerId);
    const where = this.toBaseWhere({
      customerId,
      warehouseId: this.trimOptional(query.warehouseId),
    });
    const [statusCounts, skuRows] = await Promise.all([
      this.inventoryRepository.getCustomerStatusCounts(where),
      this.inventoryRepository.getCustomerSkuCount(where),
    ]);
    const counts = this.toStatusCountMap(statusCounts);

    return {
      customerId,
      warehouseId: this.trimOptional(query.warehouseId) ?? null,
      totalQuantity: this.sumCounts(counts),
      skuCount: skuRows.length,
      inStockQuantity: counts[InventoryStatus.IN_STOCK],
      packedQuantity: counts[InventoryStatus.PACKED],
      outboundQuantity: counts[InventoryStatus.OUTBOUND],
      exceptionQuantity: counts[InventoryStatus.EXCEPTION],
      voidedQuantity: counts[InventoryStatus.VOIDED],
      availableForOutboundQuantity: counts[InventoryStatus.IN_STOCK],
    };
  }

  async listProducts(query: ListInventoryProductsQueryDto) {
    const customerId = await this.requireCustomerId(query.customerId);
    await this.findExistingCustomer(customerId);
    const allowedSortFields = new Set(['sku', 'name', 'createdAt', 'updatedAt']);
    const sortBy = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'sku';
    const where = this.toBaseWhere({
      customerId,
      warehouseId: this.trimOptional(query.warehouseId),
      search: this.trimOptional(query.search),
    });
    const result = await this.inventoryRepository.findProductSummaries({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { [sortBy]: query.sortOrder } as Prisma.ProductOrderByWithRelationInput,
    });
    const countByProduct = this.toProductStatusCountMap(
      result.statusCounts.map((row) => ({
        productId: row.productId,
        status: row.status,
        count: this.readGroupCount(row._count),
      })),
    );
    const trackingNumberCountByProduct = this.toProductTrackingNumberCountMap(result.trackingRows);

    return {
      items: result.products.map((product) => {
        const counts = countByProduct.get(product.id) ?? this.emptyStatusCounts();
        return {
          product: {
            id: product.id,
            sku: product.sku,
            brand: product.brand,
            name: product.name,
            model: product.model,
            category: product.category,
            color: product.color,
            capacity: product.capacity,
            requiresImei: product.requiresImei,
            status: product.status,
            upcs: product.upcs.map((upc) => upc.upc),
          },
          summary: {
            totalQuantity: this.sumCounts(counts),
            inStockQuantity: counts[InventoryStatus.IN_STOCK],
            packedQuantity: counts[InventoryStatus.PACKED],
            outboundQuantity: counts[InventoryStatus.OUTBOUND],
            exceptionQuantity: counts[InventoryStatus.EXCEPTION],
            voidedQuantity: counts[InventoryStatus.VOIDED],
            availableForOutboundQuantity: counts[InventoryStatus.IN_STOCK],
          },
          trackingNumberCount: trackingNumberCountByProduct.get(product.id) ?? 0,
        };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async listProductItems(productId: string, query: ListInventoryItemsQueryDto) {
    const product = await this.inventoryRepository.findProductById(productId);
    if (!product) {
      throw new NotFoundException('Product not found.');
    }
    return this.listItems({ ...query, productId });
  }

  async listItems(query: ListInventoryItemsQueryDto) {
    const normalizedQuery = this.normalizeItemQuery(query);
    if (normalizedQuery.customerId) {
      await this.findExistingCustomer(normalizedQuery.customerId);
    }
    const allowedSortFields = new Set([
      'receivedAt',
      'updatedAt',
      'upc',
      'imei',
      'serial',
      'status',
    ]);
    const sortBy =
      query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'receivedAt';
    const [total, items] = await this.inventoryRepository.findItems({
      where: this.toBaseWhere(normalizedQuery),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { [sortBy]: query.sortOrder } as Prisma.InventoryItemOrderByWithRelationInput,
    });

    return {
      items: items.map((item) => this.toItemResponse(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async listAvailableForOutbound(query: ListInventoryItemsQueryDto) {
    const customerId = await this.requireCustomerId(query.customerId);
    return this.listItems({
      ...query,
      customerId,
      status: InventoryStatus.IN_STOCK,
      availableForOutbound: true,
    });
  }

  async getItem(id: string) {
    const item = await this.inventoryRepository.findItemById(id);
    if (!item) {
      throw new NotFoundException('Inventory item not found.');
    }
    return this.toItemResponse(item);
  }

  async createExportPreview(query: ListInventoryItemsQueryDto) {
    const normalizedQuery = this.normalizeItemQuery(query);
    if (normalizedQuery.customerId) {
      await this.findExistingCustomer(normalizedQuery.customerId);
    }
    const filters = this.toBaseWhere(normalizedQuery);
    const total = await this.inventoryRepository.countItems(filters);

    return {
      reportType: 'inventory-items',
      estimatedRowCount: total,
      filters: normalizedQuery,
      reusableReportPayload: {
        reportType: 'inventory-items',
        filters: normalizedQuery,
      },
    };
  }

  private async requireCustomerId(customerId?: string) {
    const normalized = this.trimOptional(customerId);
    if (!normalized) {
      throw new BadRequestException('customerId is required for customer inventory queries.');
    }
    return normalized;
  }

  private async findExistingCustomer(id: string) {
    const customer = await this.inventoryRepository.findCustomerById(id);
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }
    return customer;
  }

  private normalizeItemQuery(query: ListInventoryItemsQueryDto) {
    return {
      customerId: this.trimOptional(query.customerId),
      warehouseId: this.trimOptional(query.warehouseId),
      productId: this.trimOptional(query.productId),
      status: query.availableForOutbound ? InventoryStatus.IN_STOCK : query.status,
      upc: query.upc?.trim(),
      imei: query.imei?.trim(),
      serial: query.serial?.trim().toUpperCase(),
      upsTrackingNo: query.upsTrackingNo?.trim().toUpperCase(),
      search: this.trimOptional(query.search),
      availableForOutbound: query.availableForOutbound,
    };
  }

  private toBaseWhere(params: {
    customerId?: string;
    warehouseId?: string;
    productId?: string;
    status?: InventoryStatus;
    upc?: string;
    imei?: string;
    serial?: string;
    upsTrackingNo?: string;
    search?: string;
    availableForOutbound?: boolean;
  }): Prisma.InventoryItemWhereInput {
    const searchWhere = this.inventoryRepository.toSearchWhere(params.search);
    const outboundWhere = params.availableForOutbound
      ? this.inventoryRepository.toOutboundAvailableWhere()
      : undefined;

    const andFilters = [searchWhere, outboundWhere].filter(
      (where): where is Prisma.InventoryItemWhereInput => Boolean(where),
    );

    return {
      AND: andFilters.length ? andFilters : undefined,
      customerId: params.customerId,
      warehouseId: params.warehouseId,
      productId: params.productId,
      status: params.status,
      upc: params.upc ? { contains: params.upc } : undefined,
      imei: params.imei ? { contains: params.imei } : undefined,
      serial: params.serial ? { contains: params.serial, mode: 'insensitive' } : undefined,
      upsTrackingNo: params.upsTrackingNo
        ? { contains: params.upsTrackingNo, mode: 'insensitive' }
        : undefined,
    };
  }

  private toItemResponse(item: InventoryItemRecord) {
    const latestBox = item.outboundBoxItems[0]?.outboundBox ?? null;

    return {
      id: item.id,
      customer: {
        id: item.customer.id,
        code: item.customer.code,
        name: item.customer.name,
      },
      warehouse: {
        id: item.warehouse.id,
        code: item.warehouse.code,
        name: item.warehouse.name,
      },
      product: {
        id: item.product.id,
        sku: item.product.sku,
        brand: item.product.brand,
        name: item.product.name,
        model: item.product.model,
        category: item.product.category,
        color: item.product.color,
        capacity: item.product.capacity,
        requiresImei: item.product.requiresImei,
        status: item.product.status,
        upcs: item.product.upcs.map((upc) => upc.upc),
      },
      inboundBatch: item.inboundBatch,
      inboundItem: item.inboundItem,
      latestOutboundBox: latestBox,
      upc: item.upc,
      upsTrackingNo: item.upsTrackingNo,
      imei: item.imei,
      serial: item.serial,
      status: item.status,
      availableForOutbound: item.status === InventoryStatus.IN_STOCK,
      receivedAt: item.receivedAt,
      packedAt: item.packedAt,
      outboundAt: item.outboundAt,
      voidedAt: item.voidedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      exceptions: item.exceptions.map((exception) => ({
        id: exception.id,
        type: exception.type,
        status: exception.status,
        rawValue: exception.rawValue,
        resolutionNote: exception.resolutionNote,
      })),
    };
  }

  private toStatusCountMap(
    rows: Array<{ status: InventoryStatus; _count: { _all: number } }>,
  ): Record<InventoryStatus, number> {
    const counts = this.emptyStatusCounts();
    for (const row of rows) {
      counts[row.status] = row._count._all;
    }
    return counts;
  }

  private toProductStatusCountMap(
    rows: Array<{ productId: string; status: InventoryStatus; count: number }>,
  ) {
    const map = new Map<string, Record<InventoryStatus, number>>();
    for (const row of rows) {
      const counts = map.get(row.productId) ?? this.emptyStatusCounts();
      counts[row.status] = row.count;
      map.set(row.productId, counts);
    }
    return map;
  }

  private toProductTrackingNumberCountMap(
    rows: Array<{
      productId: string;
      upsTrackingNo: string | null;
    }>,
  ) {
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.upsTrackingNo) {
        continue;
      }
      const numbers = map.get(row.productId) ?? new Set<string>();
      numbers.add(row.upsTrackingNo);
      map.set(row.productId, numbers);
    }
    return new Map([...map.entries()].map(([productId, numbers]) => [productId, numbers.size]));
  }

  private emptyStatusCounts(): Record<InventoryStatus, number> {
    return {
      [InventoryStatus.IN_STOCK]: 0,
      [InventoryStatus.PACKED]: 0,
      [InventoryStatus.OUTBOUND]: 0,
      [InventoryStatus.EXCEPTION]: 0,
      [InventoryStatus.VOIDED]: 0,
    };
  }

  private sumCounts(counts: Record<InventoryStatus, number>) {
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
  }

  private readGroupCount(count: true | { _all?: number } | undefined) {
    if (!count || count === true) {
      return 0;
    }
    return count._all ?? 0;
  }

  private trimOptional(value?: string) {
    const trimmed = value?.trim();
    return trimmed || undefined;
  }
}
