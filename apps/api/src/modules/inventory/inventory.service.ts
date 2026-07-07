import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { DeleteInventoryItemsDto } from './dto/delete-inventory-items.dto';
import { DeleteInventoryProductsDto } from './dto/delete-inventory-products.dto';
import { InventoryCustomerSummaryQueryDto } from './dto/inventory-customer-summary-query.dto';
import { ListInventoryItemsQueryDto } from './dto/list-inventory-items-query.dto';
import { ListInventoryProductsQueryDto } from './dto/list-inventory-products-query.dto';
import { InventoryItemRecord, InventoryRepository } from './inventory.repository';

@Injectable()
export class InventoryService {
  constructor(private readonly inventoryRepository: InventoryRepository) {}

  async getCustomerSummary(query: InventoryCustomerSummaryQueryDto) {
    const customerId = this.trimOptional(query.customerId);
    if (customerId) {
      await this.findExistingCustomer(customerId);
    }
    const where = this.toBaseWhere({
      customerId,
      warehouseId: this.trimOptional(query.warehouseId),
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    const [statusCounts, skuRows] = await Promise.all([
      this.inventoryRepository.getCustomerStatusCounts(where),
      this.inventoryRepository.getCustomerSkuCount(where),
    ]);
    const counts = this.toStatusCountMap(statusCounts);

    return {
      customerId: customerId ?? null,
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
    const customerId = this.trimOptional(query.customerId);
    if (customerId) {
      await this.findExistingCustomer(customerId);
    }
    const allowedSortFields = new Set(['sku', 'name', 'createdAt', 'updatedAt']);
    const sortBy = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'sku';
    const where = this.toBaseWhere({
      customerId,
      warehouseId: this.trimOptional(query.warehouseId),
      search: this.trimOptional(query.search),
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
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
        customerId: row.customerId,
        status: row.status,
        count: this.readGroupCount(row._count),
      })),
    );
    const trackingNumberCountByProduct = this.toProductTrackingNumberCountMap(result.trackingRows);

    return {
      items: result.rows.map((row) => {
        const product = row.product;
        const counts =
          countByProduct.get(this.toProductCustomerKey(product.id, row.customerId)) ??
          this.emptyStatusCounts();
        return {
          customer: row.customer
            ? {
                id: row.customer.id,
                code: row.customer.code,
                name: row.customer.name,
              }
            : null,
          product: {
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
          trackingNumberCount:
            trackingNumberCountByProduct.get(
              this.toProductCustomerKey(product.id, row.customerId),
            ) ?? 0,
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
    const orderBy =
      sortBy === 'status'
        ? [{ status: query.sortOrder }, { updatedAt: 'desc' as const }]
        : ({ [sortBy]: query.sortOrder } as Prisma.InventoryItemOrderByWithRelationInput);
    const [total, items] = await this.inventoryRepository.findItems({
      where: this.toBaseWhere(normalizedQuery),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy,
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

  async deleteProducts(dto: DeleteInventoryProductsDto, operator: AuthenticatedUser) {
    const customerId = await this.requireCustomerId(dto.customerId);
    await this.findExistingCustomer(customerId);
    const productIds = [...new Set(dto.productIds.map((id) => id.trim()).filter(Boolean))];
    if (!productIds.length) {
      throw new BadRequestException('At least one product must be selected.');
    }

    return this.inventoryRepository.deleteProducts({
      customerId,
      warehouseId: this.trimOptional(dto.warehouseId),
      productIds,
      operator,
    });
  }

  async deleteItems(dto: DeleteInventoryItemsDto, operator: AuthenticatedUser) {
    const customerId = await this.requireCustomerId(dto.customerId);
    await this.findExistingCustomer(customerId);
    const itemIds = [...new Set(dto.itemIds.map((id) => id.trim()).filter(Boolean))];
    if (!itemIds.length) {
      throw new BadRequestException('At least one inventory item must be selected.');
    }

    return this.inventoryRepository.deleteItems({
      customerId,
      warehouseId: this.trimOptional(dto.warehouseId),
      itemIds,
      operator,
    });
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
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
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
    dateFrom?: string;
    dateTo?: string;
  }): Prisma.InventoryItemWhereInput {
    const searchWhere = this.inventoryRepository.toSearchWhere(params.search);
    const outboundWhere = params.availableForOutbound
      ? this.inventoryRepository.toOutboundAvailableWhere()
      : undefined;
    const activityDateWhere = this.toActivityDateWhere(
      this.normalizeDateRange(params.dateFrom, params.dateTo),
      params.status,
    );

    const andFilters = [searchWhere, outboundWhere, activityDateWhere].filter(
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

  private normalizeDateRange(dateFrom?: string, dateTo?: string) {
    const from = this.parseDateBoundary(dateFrom, false);
    const to = this.parseDateBoundary(dateTo, true);
    if (from && to && from > to) {
      throw new BadRequestException('dateTo must be greater than or equal to dateFrom.');
    }
    if (!from && !to) {
      return undefined;
    }
    return { from, to };
  }

  private parseDateBoundary(value: string | undefined, endOfDay: boolean) {
    const normalized = this.trimOptional(value);
    if (!normalized) {
      return undefined;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
      return new Date(`${normalized}${suffix}`);
    }
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid inventory date filter.');
    }
    return date;
  }

  private toActivityDateWhere(
    range: { from?: Date; to?: Date } | undefined,
    status?: InventoryStatus,
  ): Prisma.InventoryItemWhereInput | undefined {
    if (!range) {
      return undefined;
    }
    const dateFilter = {
      gte: range.from,
      lte: range.to,
    };
    const buildStatusDateWhere = (
      statusValue: InventoryStatus,
      field: 'receivedAt' | 'packedAt' | 'outboundAt',
    ): Prisma.InventoryItemWhereInput => ({
      status: statusValue,
      [field]: dateFilter,
    });

    if (status === InventoryStatus.PACKED) {
      return buildStatusDateWhere(InventoryStatus.PACKED, 'packedAt');
    }
    if (status === InventoryStatus.OUTBOUND) {
      return buildStatusDateWhere(InventoryStatus.OUTBOUND, 'outboundAt');
    }
    if (status) {
      return buildStatusDateWhere(status, 'receivedAt');
    }

    return {
      OR: [
        buildStatusDateWhere(InventoryStatus.PACKED, 'packedAt'),
        buildStatusDateWhere(InventoryStatus.OUTBOUND, 'outboundAt'),
        {
          status: {
            in: [InventoryStatus.IN_STOCK, InventoryStatus.EXCEPTION, InventoryStatus.VOIDED],
          },
          receivedAt: dateFilter,
        },
      ],
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
        modelCode: item.product.modelCode,
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
    rows: Array<{ productId: string; customerId: string; status: InventoryStatus; count: number }>,
  ) {
    const map = new Map<string, Record<InventoryStatus, number>>();
    for (const row of rows) {
      const key = this.toProductCustomerKey(row.productId, row.customerId);
      const counts = map.get(key) ?? this.emptyStatusCounts();
      counts[row.status] = row.count;
      map.set(key, counts);
    }
    return map;
  }

  private toProductTrackingNumberCountMap(
    rows: Array<{
      productId: string;
      customerId: string;
      upsTrackingNo: string | null;
    }>,
  ) {
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.upsTrackingNo) {
        continue;
      }
      const key = this.toProductCustomerKey(row.productId, row.customerId);
      const numbers = map.get(key) ?? new Set<string>();
      numbers.add(row.upsTrackingNo);
      map.set(key, numbers);
    }
    return new Map([...map.entries()].map(([productId, numbers]) => [productId, numbers.size]));
  }

  private toProductCustomerKey(productId: string, customerId: string) {
    return `${customerId}:${productId}`;
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
