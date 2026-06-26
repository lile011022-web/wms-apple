import { Injectable } from '@nestjs/common';
import { InventoryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

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
    const productIds = await this.prisma.inventoryItem.findMany({
      where: params.where,
      distinct: ['productId'],
      select: { productId: true },
    });
    const ids = productIds.map((row) => row.productId);
    const [products, statusCounts] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: { id: { in: ids } },
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
        include: {
          upcs: {
            orderBy: { upc: 'asc' },
          },
        },
      }),
      this.prisma.inventoryItem.groupBy({
        by: ['productId', 'status'],
        where: params.where,
        orderBy: [{ productId: 'asc' }, { status: 'asc' }],
        _count: { _all: true },
      }),
    ]);
    const pageProductIds = products.map((product) => product.id);
    const trackingRows = pageProductIds.length
      ? await this.prisma.inventoryItem.findMany({
          where: {
            AND: [
              params.where,
              { productId: { in: pageProductIds }, upsTrackingNo: { not: null } },
            ],
          },
          select: {
            productId: true,
            upsTrackingNo: true,
          },
          distinct: ['productId', 'upsTrackingNo'],
          orderBy: { receivedAt: 'desc' },
        })
      : [];

    return {
      total: ids.length,
      products,
      statusCounts,
      trackingRows,
    };
  }

  findItems(params: {
    where: Prisma.InventoryItemWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.InventoryItemOrderByWithRelationInput;
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
      ],
    };
  }

  toOutboundAvailableWhere(): Prisma.InventoryItemWhereInput {
    return {
      status: InventoryStatus.IN_STOCK,
    };
  }
}
