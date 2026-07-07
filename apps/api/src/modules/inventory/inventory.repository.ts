import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditAction, InventoryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const inventoryItemInclude = {
  customer: true,
  warehouse: true,
  product: {
    include: {
      upcs: {
        orderBy: { upc: 'asc' as const },
      },
    },
  },
  inboundBatch: {
    select: {
      id: true,
      batchNo: true,
      confirmedAt: true,
    },
  },
  inboundItem: {
    select: {
      id: true,
      scannedAt: true,
      status: true,
    },
  },
  outboundBoxItems: {
    include: {
      outboundBox: {
        select: {
          id: true,
          boxNo: true,
          boxName: true,
          status: true,
          sealedAt: true,
        },
      },
    },
    orderBy: { packedAt: 'desc' as const },
  },
  exceptions: {
    orderBy: { createdAt: 'desc' as const },
  },
};

export type InventoryItemRecord = NonNullable<
  Awaited<ReturnType<InventoryRepository['findItemById']>>
>;

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCustomerById(id: string) {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  findProductById(id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      include: {
        upcs: {
          orderBy: { upc: 'asc' },
        },
      },
    });
  }

  getCustomerStatusCounts(where: Prisma.InventoryItemWhereInput) {
    return this.prisma.inventoryItem.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
  }

  getCustomerSkuCount(where: Prisma.InventoryItemWhereInput) {
    return this.prisma.inventoryItem.findMany({
      where,
      distinct: ['productId'],
      select: { productId: true },
    });
  }

  async findProductSummaries(params: {
    where: Prisma.InventoryItemWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.ProductOrderByWithRelationInput;
  }) {
    const groups = await this.prisma.inventoryItem.groupBy({
      by: ['customerId', 'productId'],
      where: params.where,
      orderBy: [{ productId: 'asc' }, { customerId: 'asc' }],
    });
    const productIds = [...new Set(groups.map((row) => row.productId))];
    const customerIds = [...new Set(groups.map((row) => row.customerId))];
    const [products, customers, statusCounts] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        orderBy: params.orderBy,
        include: {
          upcs: {
            orderBy: { upc: 'asc' },
          },
        },
      }),
      this.prisma.customer.findMany({
        where: { id: { in: customerIds } },
        orderBy: { code: 'asc' },
      }),
      this.prisma.inventoryItem.groupBy({
        by: ['customerId', 'productId', 'status'],
        where: params.where,
        orderBy: [{ productId: 'asc' }, { customerId: 'asc' }, { status: 'asc' }],
        _count: { _all: true },
      }),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const sortedRows = groups
      .map((group) => ({
        productId: group.productId,
        customerId: group.customerId,
        product: productById.get(group.productId),
        customer: customerById.get(group.customerId),
      }))
      .filter((row): row is typeof row & { product: NonNullable<typeof row.product> } =>
        Boolean(row.product),
      )
      .sort((left, right) => {
        const productCompare =
          compareProductForOrder(left.product, right.product, params.orderBy) ||
          left.product.sku.localeCompare(right.product.sku);
        return productCompare || left.customerId.localeCompare(right.customerId);
      });
    const pageRows = sortedRows.slice(params.skip, params.skip + params.take);
    const pageProductIds = [...new Set(pageRows.map((row) => row.productId))];
    const pageCustomerIds = [...new Set(pageRows.map((row) => row.customerId))];
    const trackingRows = pageRows.length
      ? await this.prisma.inventoryItem.findMany({
          where: {
            AND: [
              params.where,
              { productId: { in: pageProductIds }, upsTrackingNo: { not: null } },
              { customerId: { in: pageCustomerIds } },
            ],
          },
          select: {
            productId: true,
            customerId: true,
            upsTrackingNo: true,
          },
          distinct: ['customerId', 'productId', 'upsTrackingNo'],
          orderBy: { receivedAt: 'desc' },
        })
      : [];

    return {
      total: groups.length,
      rows: pageRows,
      statusCounts,
      trackingRows,
    };
  }

  findItems(params: {
    where: Prisma.InventoryItemWhereInput;
    skip: number;
    take: number;
    orderBy:
      | Prisma.InventoryItemOrderByWithRelationInput
      | Prisma.InventoryItemOrderByWithRelationInput[];
  }) {
    return this.prisma.$transaction([
      this.prisma.inventoryItem.count({ where: params.where }),
      this.prisma.inventoryItem.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
        include: inventoryItemInclude,
      }),
    ]);
  }

  countItems(where: Prisma.InventoryItemWhereInput) {
    return this.prisma.inventoryItem.count({ where });
  }

  findItemById(id: string) {
    return this.prisma.inventoryItem.findUnique({
      where: { id },
      include: inventoryItemInclude,
    });
  }

  async deleteProducts(input: {
    customerId: string;
    warehouseId?: string;
    productIds: string[];
    operator: AuthenticatedUser;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const where: Prisma.InventoryItemWhereInput = {
        customerId: input.customerId,
        warehouseId: input.warehouseId,
        productId: { in: input.productIds },
      };
      const inventoryItems = await tx.inventoryItem.findMany({
        where,
        select: {
          id: true,
          productId: true,
          upc: true,
          imei: true,
          serial: true,
          status: true,
        },
      });
      const inventoryItemIds = inventoryItems.map((item) => item.id);

      if (!inventoryItemIds.length) {
        return {
          deletedInventoryItems: 0,
          deletedOutboundBoxItems: 0,
          clearedInboundLinks: 0,
          clearedExceptionLinks: 0,
        };
      }

      const deletedOutboundBoxItems = await tx.outboundBoxItem.deleteMany({
        where: { inventoryItemId: { in: inventoryItemIds } },
      });
      const clearedInboundLinks = await tx.inboundItem.updateMany({
        where: { inventoryItemId: { in: inventoryItemIds } },
        data: { inventoryItemId: null },
      });
      const clearedExceptionLinks = await tx.exceptionRecord.updateMany({
        where: { inventoryItemId: { in: inventoryItemIds } },
        data: { inventoryItemId: null },
      });

      const deletedInventoryItems = await tx.inventoryItem.deleteMany({
        where: { id: { in: inventoryItemIds } },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.CUSTOMER_CHANGE,
          resourceType: 'inventory-products',
          resourceId: input.customerId,
          operatorId: input.operator.id,
          beforeSnapshot: {
            customerId: input.customerId,
            warehouseId: input.warehouseId ?? null,
            productIds: input.productIds,
            itemCount: inventoryItems.length,
            sampleItems: inventoryItems.slice(0, 20),
          },
          afterSnapshot: {
            deletedInventoryItems: deletedInventoryItems.count,
            deletedOutboundBoxItems: deletedOutboundBoxItems.count,
            clearedInboundLinks: clearedInboundLinks.count,
            clearedExceptionLinks: clearedExceptionLinks.count,
          },
          metadata: {
            operation: 'inventory_product_delete',
            customerId: input.customerId,
            warehouseId: input.warehouseId ?? null,
            productIds: input.productIds,
            deletedInventoryItems: deletedInventoryItems.count,
          },
        },
      });

      return {
        deletedInventoryItems: deletedInventoryItems.count,
        deletedOutboundBoxItems: deletedOutboundBoxItems.count,
        clearedInboundLinks: clearedInboundLinks.count,
        clearedExceptionLinks: clearedExceptionLinks.count,
      };
    });
  }

  async deleteItems(input: {
    customerId: string;
    warehouseId?: string;
    itemIds: string[];
    operator: AuthenticatedUser;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const inventoryItems = await tx.inventoryItem.findMany({
        where: {
          id: { in: input.itemIds },
          customerId: input.customerId,
          warehouseId: input.warehouseId,
        },
        select: {
          id: true,
          productId: true,
          upc: true,
          imei: true,
          serial: true,
          status: true,
          outboundBoxItems: {
            select: {
              id: true,
              outboundBox: {
                select: {
                  boxNo: true,
                  status: true,
                },
              },
            },
          },
        },
      });
      const foundIds = new Set(inventoryItems.map((item) => item.id));
      const missingIds = input.itemIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new BadRequestException('部分库存明细不存在，或不属于当前客户/仓库，请刷新后重试。');
      }

      const blockedItems = inventoryItems.filter(
        (item) =>
          item.status === InventoryStatus.PACKED ||
          item.status === InventoryStatus.OUTBOUND ||
          item.outboundBoxItems.length > 0,
      );
      if (blockedItems.length > 0) {
        const labels = blockedItems
          .slice(0, 10)
          .map((item) => item.imei ?? item.serial ?? item.upc)
          .join(', ');
        throw new BadRequestException(
          `已装箱或已出库的库存明细不能在客户库存页删除，请先处理出库箱关联: ${labels}`,
        );
      }

      if (!inventoryItems.length) {
        return {
          deletedInventoryItems: 0,
          clearedInboundLinks: 0,
          clearedExceptionLinks: 0,
        };
      }

      const inventoryItemIds = inventoryItems.map((item) => item.id);
      const clearedInboundLinks = await tx.inboundItem.updateMany({
        where: { inventoryItemId: { in: inventoryItemIds } },
        data: { inventoryItemId: null },
      });
      const clearedExceptionLinks = await tx.exceptionRecord.updateMany({
        where: { inventoryItemId: { in: inventoryItemIds } },
        data: { inventoryItemId: null },
      });
      const deletedInventoryItems = await tx.inventoryItem.deleteMany({
        where: { id: { in: inventoryItemIds } },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.CUSTOMER_CHANGE,
          resourceType: 'inventory-items',
          resourceId: input.customerId,
          operatorId: input.operator.id,
          beforeSnapshot: {
            customerId: input.customerId,
            warehouseId: input.warehouseId ?? null,
            itemIds: input.itemIds,
            itemCount: inventoryItems.length,
            sampleItems: inventoryItems.slice(0, 20).map((item) => ({
              id: item.id,
              productId: item.productId,
              upc: item.upc,
              imei: item.imei,
              serial: item.serial,
              status: item.status,
            })),
          },
          afterSnapshot: {
            deletedInventoryItems: deletedInventoryItems.count,
            clearedInboundLinks: clearedInboundLinks.count,
            clearedExceptionLinks: clearedExceptionLinks.count,
          },
          metadata: {
            operation: 'inventory_item_delete',
            customerId: input.customerId,
            warehouseId: input.warehouseId ?? null,
            deletedInventoryItems: deletedInventoryItems.count,
          },
        },
      });

      return {
        deletedInventoryItems: deletedInventoryItems.count,
        clearedInboundLinks: clearedInboundLinks.count,
        clearedExceptionLinks: clearedExceptionLinks.count,
      };
    });
  }

  toSearchWhere(search?: string): Prisma.InventoryItemWhereInput | undefined {
    const trimmed = search?.trim();
    if (!trimmed) {
      return undefined;
    }

    return {
      OR: [
        { upc: { contains: trimmed } },
        { imei: { contains: trimmed } },
        { serial: { contains: trimmed, mode: 'insensitive' } },
        { upsTrackingNo: { contains: trimmed, mode: 'insensitive' } },
        { inboundBatch: { batchNo: { contains: trimmed, mode: 'insensitive' } } },
        {
          outboundBoxItems: {
            some: {
              outboundBox: {
                OR: [
                  { boxNo: { contains: trimmed, mode: 'insensitive' } },
                  { boxName: { contains: trimmed, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
        { product: { sku: { contains: trimmed, mode: 'insensitive' } } },
        { product: { name: { contains: trimmed, mode: 'insensitive' } } },
        { customer: { code: { contains: trimmed, mode: 'insensitive' } } },
        { customer: { name: { contains: trimmed, mode: 'insensitive' } } },
      ],
    };
  }

  toOutboundAvailableWhere(): Prisma.InventoryItemWhereInput {
    return {
      status: InventoryStatus.IN_STOCK,
    };
  }
}

function compareProductForOrder(
  left: Prisma.ProductGetPayload<{ include: { upcs: true } }>,
  right: Prisma.ProductGetPayload<{ include: { upcs: true } }>,
  orderBy: Prisma.ProductOrderByWithRelationInput,
) {
  const [field, direction] = Object.entries(orderBy)[0] ?? ['sku', 'asc'];
  const leftValue = readSortableProductValue(left, field);
  const rightValue = readSortableProductValue(right, field);
  const result =
    leftValue instanceof Date && rightValue instanceof Date
      ? leftValue.getTime() - rightValue.getTime()
      : String(leftValue ?? '').localeCompare(String(rightValue ?? ''));
  return direction === 'desc' ? -result : result;
}

function readSortableProductValue(
  product: Prisma.ProductGetPayload<{ include: { upcs: true } }>,
  field: string,
) {
  if (field === 'name') return product.name;
  if (field === 'createdAt') return product.createdAt;
  if (field === 'updatedAt') return product.updatedAt;
  return product.sku;
}
