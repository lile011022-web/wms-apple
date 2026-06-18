import { Injectable } from '@nestjs/common';
import { AuditAction, InventoryStatus, OutboundBoxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const outboundBoxInclude = {
  customer: true,
  warehouse: true,
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  items: {
    orderBy: { packedAt: 'asc' as const },
    include: {
      inventoryItem: {
        include: {
          product: {
            include: {
              upcs: {
                orderBy: { upc: 'asc' as const },
              },
            },
          },
        },
      },
    },
  },
};

export type OutboundBoxRecord = NonNullable<Awaited<ReturnType<OutboundRepository['findBoxById']>>>;
export type OutboundInventoryItemRecord = NonNullable<
  Awaited<ReturnType<OutboundRepository['findInventoryItemById']>>
>;

@Injectable()
export class OutboundRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCustomerById(id: string) {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  findWarehouseById(id: string) {
    return this.prisma.warehouse.findUnique({ where: { id } });
  }

  findBoxByNo(warehouseId: string, boxNo: string) {
    return this.prisma.outboundBox.findUnique({
      where: {
        warehouseId_boxNo: {
          warehouseId,
          boxNo,
        },
      },
      include: outboundBoxInclude,
    });
  }

  findLatestBoxByPrefix(warehouseId: string, boxNoPrefix: string) {
    return this.prisma.outboundBox.findFirst({
      where: {
        warehouseId,
        boxNo: { startsWith: boxNoPrefix },
      },
      orderBy: { boxNo: 'desc' },
      include: outboundBoxInclude,
    });
  }

  createBox(data: Prisma.OutboundBoxCreateInput) {
    return this.prisma.outboundBox.create({
      data,
      include: outboundBoxInclude,
    });
  }

  findBoxById(id: string) {
    return this.prisma.outboundBox.findUnique({
      where: { id },
      include: outboundBoxInclude,
    });
  }

  findBoxes(params: {
    where: Prisma.OutboundBoxWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.OutboundBoxOrderByWithRelationInput;
  }) {
    return this.prisma.$transaction([
      this.prisma.outboundBox.count({ where: params.where }),
      this.prisma.outboundBox.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
        include: outboundBoxInclude,
      }),
    ]);
  }

  findInventoryItemById(id: string) {
    return this.prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        customer: true,
        warehouse: true,
        product: {
          include: {
            upcs: {
              orderBy: { upc: 'asc' },
            },
          },
        },
        outboundBoxItems: {
          include: {
            outboundBox: {
              select: {
                id: true,
                boxNo: true,
                status: true,
              },
            },
          },
        },
      },
    });
  }

  async addItemToBox(boxId: string, inventoryItemId: string) {
    return this.prisma.$transaction(async (tx) => {
      const boxItem = await tx.outboundBoxItem.create({
        data: {
          outboundBoxId: boxId,
          inventoryItemId,
        },
      });

      await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: {
          status: InventoryStatus.PACKED,
          packedAt: boxItem.packedAt,
        },
      });

      return tx.outboundBox.findUniqueOrThrow({
        where: { id: boxId },
        include: outboundBoxInclude,
      });
    });
  }

  async removeItemFromBox(boxId: string, inventoryItemId: string) {
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.outboundBoxItem.delete({
        where: { inventoryItemId },
      });

      await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: {
          status: InventoryStatus.IN_STOCK,
          packedAt: null,
        },
      });

      const box = await tx.outboundBox.findUniqueOrThrow({
        where: { id: boxId },
        include: outboundBoxInclude,
      });

      return { deleted, box };
    });
  }

  async clearBoxItems(boxId: string, inventoryItemIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.outboundBoxItem.deleteMany({
        where: { outboundBoxId: boxId },
      });

      if (inventoryItemIds.length) {
        await tx.inventoryItem.updateMany({
          where: {
            id: { in: inventoryItemIds },
            status: InventoryStatus.PACKED,
          },
          data: {
            status: InventoryStatus.IN_STOCK,
            packedAt: null,
          },
        });
      }

      const box = await tx.outboundBox.findUniqueOrThrow({
        where: { id: boxId },
        include: outboundBoxInclude,
      });

      return { clearedCount: result.count, box };
    });
  }

  async sealBox(input: { boxId: string; operatorId: string }) {
    return this.prisma.$transaction(async (tx) => {
      const box = await tx.outboundBox.findUniqueOrThrow({
        where: { id: input.boxId },
        include: outboundBoxInclude,
      });
      const itemIds = box.items.map((item) => item.inventoryItemId);
      const sealedAt = new Date();

      if (itemIds.length) {
        await tx.inventoryItem.updateMany({
          where: { id: { in: itemIds } },
          data: {
            status: InventoryStatus.PACKED,
            packedAt: sealedAt,
          },
        });
      }

      const sealed = await tx.outboundBox.update({
        where: { id: box.id },
        data: {
          status: OutboundBoxStatus.SEALED,
          sealedAt,
        },
        include: outboundBoxInclude,
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.OUTBOUND_BOX_SEAL,
          resourceType: 'outbound-box',
          resourceId: box.id,
          operatorId: input.operatorId,
          beforeSnapshot: {
            boxId: box.id,
            boxNo: box.boxNo,
            status: box.status,
            itemIds,
          },
          afterSnapshot: {
            boxId: sealed.id,
            boxNo: sealed.boxNo,
            status: sealed.status,
            sealedAt: sealed.sealedAt,
            itemIds,
          },
          metadata: {
            itemCount: itemIds.length,
            customerId: box.customerId,
            warehouseId: box.warehouseId,
          },
        },
      });

      return sealed;
    });
  }
}
