import { Injectable } from '@nestjs/common';
import { AuditAction, InventoryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

const customerChangeItemInclude = {
  customer: true,
  product: {
    include: {
      upcs: {
        orderBy: { upc: 'asc' as const },
      },
    },
  },
  inboundBatch: {
    include: {
      warehouse: true,
      operator: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  },
  inventoryItem: {
    include: {
      customer: true,
      warehouse: true,
      outboundBoxItems: {
        include: {
          outboundBox: {
            select: {
              id: true,
              boxNo: true,
              status: true,
              sealedAt: true,
            },
          },
        },
        orderBy: { packedAt: 'desc' as const },
      },
    },
  },
  exceptions: true,
};

const customerChangeLogInclude = {
  oldCustomer: true,
  newCustomer: true,
  operator: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
};

export type CustomerChangeItemRecord = NonNullable<
  Awaited<ReturnType<CustomerChangeRepository['findItemById']>>
>;
export type CustomerChangeLogRecord = NonNullable<
  Awaited<ReturnType<CustomerChangeRepository['findLogById']>>
>;

@Injectable()
export class CustomerChangeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCustomerById(id: string) {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  findCandidates(params: {
    skip: number;
    take: number;
    search?: string;
    currentCustomerId?: string;
    warehouseId?: string;
    upsTrackingNo?: string;
    upc?: string;
    imei?: string;
    productName?: string;
    dateFrom?: Date;
    dateTo?: Date;
    orderBy: Prisma.InboundItemOrderByWithRelationInput;
  }) {
    const where = this.toCandidateWhere(params);
    return this.prisma.$transaction([
      this.prisma.inboundItem.count({ where }),
      this.prisma.inboundItem.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
        include: customerChangeItemInclude,
      }),
    ]);
  }

  findItemsByIds(ids: string[]) {
    return this.prisma.inboundItem.findMany({
      where: { id: { in: ids } },
      include: customerChangeItemInclude,
    });
  }

  findItemById(id: string) {
    return this.prisma.inboundItem.findUnique({
      where: { id },
      include: customerChangeItemInclude,
    });
  }

  findLogs(params: {
    skip: number;
    take: number;
    search?: string;
    oldCustomerId?: string;
    newCustomerId?: string;
    operatorId?: string;
    orderBy: Prisma.CustomerChangeLogOrderByWithRelationInput;
  }) {
    const where: Prisma.CustomerChangeLogWhereInput = {
      oldCustomerId: params.oldCustomerId,
      newCustomerId: params.newCustomerId,
      operatorId: params.operatorId,
      OR: params.search
        ? [
            { reason: { contains: params.search, mode: 'insensitive' } },
            { oldCustomer: { code: { contains: params.search, mode: 'insensitive' } } },
            { oldCustomer: { name: { contains: params.search, mode: 'insensitive' } } },
            { newCustomer: { code: { contains: params.search, mode: 'insensitive' } } },
            { newCustomer: { name: { contains: params.search, mode: 'insensitive' } } },
            { operator: { email: { contains: params.search, mode: 'insensitive' } } },
            { operator: { name: { contains: params.search, mode: 'insensitive' } } },
          ]
        : undefined,
    };

    return this.prisma.$transaction([
      this.prisma.customerChangeLog.count({ where }),
      this.prisma.customerChangeLog.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
        include: customerChangeLogInclude,
      }),
    ]);
  }

  findLogById(id: string) {
    return this.prisma.customerChangeLog.findUnique({
      where: { id },
      include: customerChangeLogInclude,
    });
  }

  async commit(input: {
    itemIds: string[];
    oldCustomerId: string;
    newCustomerId: string;
    operatorId: string;
    reason: string;
    beforeSnapshot: Prisma.InputJsonValue;
    afterSnapshot: Prisma.InputJsonValue;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.inboundItem.updateMany({
        where: {
          id: { in: input.itemIds },
          customerId: input.oldCustomerId,
        },
        data: { customerId: input.newCustomerId },
      });

      const inventoryItems = await tx.inventoryItem.findMany({
        where: {
          inboundItem: {
            id: { in: input.itemIds },
          },
        },
        select: { id: true },
      });
      const inventoryItemIds = inventoryItems.map((item) => item.id);

      await tx.inventoryItem.updateMany({
        where: {
          id: { in: inventoryItemIds },
          customerId: input.oldCustomerId,
        },
        data: { customerId: input.newCustomerId },
      });

      await tx.exceptionRecord.updateMany({
        where: {
          OR: [
            { inboundItemId: { in: input.itemIds } },
            { inventoryItemId: { in: inventoryItemIds } },
          ],
          customerId: input.oldCustomerId,
        },
        data: { customerId: input.newCustomerId },
      });

      const log = await tx.customerChangeLog.create({
        data: {
          oldCustomerId: input.oldCustomerId,
          newCustomerId: input.newCustomerId,
          operatorId: input.operatorId,
          reason: input.reason,
          affectedCount: input.itemIds.length,
          affectedItemIds: input.itemIds,
          beforeSnapshot: input.beforeSnapshot,
          afterSnapshot: input.afterSnapshot,
        },
        include: customerChangeLogInclude,
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.CUSTOMER_BATCH_CHANGE,
          resourceType: 'customer-change-log',
          resourceId: log.id,
          operatorId: input.operatorId,
          beforeSnapshot: input.beforeSnapshot,
          afterSnapshot: input.afterSnapshot,
          metadata: {
            oldCustomerId: input.oldCustomerId,
            newCustomerId: input.newCustomerId,
            affectedCount: input.itemIds.length,
          },
        },
      });

      return log;
    });
  }

  private toCandidateWhere(params: {
    search?: string;
    currentCustomerId?: string;
    warehouseId?: string;
    upsTrackingNo?: string;
    upc?: string;
    imei?: string;
    productName?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Prisma.InboundItemWhereInput {
    return {
      customerId: params.currentCustomerId,
      status: 'CONFIRMED',
      inventoryItem: {
        is: {
          status: { in: [InventoryStatus.IN_STOCK, InventoryStatus.EXCEPTION] },
        },
      },
      inboundBatch: {
        warehouseId: params.warehouseId,
      },
      upsTrackingNo: params.upsTrackingNo
        ? { contains: params.upsTrackingNo, mode: 'insensitive' }
        : undefined,
      upc: params.upc ? { contains: params.upc } : undefined,
      imei: params.imei ? { contains: params.imei } : undefined,
      product: params.productName
        ? { name: { contains: params.productName, mode: 'insensitive' } }
        : undefined,
      scannedAt:
        params.dateFrom || params.dateTo
          ? {
              gte: params.dateFrom,
              lte: params.dateTo,
            }
          : undefined,
      OR: params.search
        ? [
            { upsTrackingNo: { contains: params.search, mode: 'insensitive' } },
            { upc: { contains: params.search } },
            { imei: { contains: params.search } },
            { serial: { contains: params.search, mode: 'insensitive' } },
            { customer: { code: { contains: params.search, mode: 'insensitive' } } },
            { customer: { name: { contains: params.search, mode: 'insensitive' } } },
            { product: { sku: { contains: params.search, mode: 'insensitive' } } },
            { product: { name: { contains: params.search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
  }
}
