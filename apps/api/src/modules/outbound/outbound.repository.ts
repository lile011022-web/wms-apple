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

  findBoxByName(warehouseId: string, boxName: string, excludeBoxId?: string) {
    return this.prisma.outboundBox.findFirst({
      where: {
        warehouseId,
        boxName: { equals: boxName, mode: 'insensitive' },
        id: excludeBoxId ? { not: excludeBoxId } : undefined,
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

  async createBoxWithAudit(data: Prisma.OutboundBoxCreateInput, operatorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const box = await tx.outboundBox.create({
        data,
        include: outboundBoxInclude,
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.OUTBOUND_BOX_CREATE,
          resourceType: 'outbound-box',
          resourceId: box.id,
          operatorId,
          afterSnapshot: this.toBoxAuditSnapshot(box),
          metadata: {
            customerId: box.customerId,
            warehouseId: box.warehouseId,
          },
        },
      });

      return box;
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

  async updateBoxWithAudit(input: {
    boxId: string;
    operatorId: string;
    data: Prisma.OutboundBoxUpdateInput;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.outboundBox.findUniqueOrThrow({
        where: { id: input.boxId },
        include: outboundBoxInclude,
      });
      const updated = await tx.outboundBox.update({
        where: { id: input.boxId },
        data: input.data,
        include: outboundBoxInclude,
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.OUTBOUND_BOX_UPDATE,
          resourceType: 'outbound-box',
          resourceId: input.boxId,
          operatorId: input.operatorId,
          beforeSnapshot: this.toBoxAuditSnapshot(before),
          afterSnapshot: this.toBoxAuditSnapshot(updated),
          metadata: {
            customerId: before.customerId,
            warehouseId: before.warehouseId,
          },
        },
      });

      return updated;
    });
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

  async addItemToBox(boxId: string, inventoryItemId: string, operatorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.outboundBox.findUniqueOrThrow({
        where: { id: boxId },
        include: outboundBoxInclude,
      });
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

      const box = await tx.outboundBox.findUniqueOrThrow({
        where: { id: boxId },
        include: outboundBoxInclude,
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.OUTBOUND_BOX_ITEM_ADD,
          resourceType: 'outbound-box',
          resourceId: boxId,
          operatorId,
          beforeSnapshot: this.toBoxAuditSnapshot(before),
          afterSnapshot: this.toBoxAuditSnapshot(box),
          metadata: {
            inventoryItemId,
            outboundBoxItemId: boxItem.id,
            customerId: box.customerId,
            warehouseId: box.warehouseId,
          },
        },
      });

      return box;
    });
  }

  async removeItemFromBox(boxId: string, inventoryItemId: string, operatorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.outboundBox.findUniqueOrThrow({
        where: { id: boxId },
        include: outboundBoxInclude,
      });
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

      await tx.auditLog.create({
        data: {
          action: AuditAction.OUTBOUND_BOX_ITEM_REMOVE,
          resourceType: 'outbound-box',
          resourceId: boxId,
          operatorId,
          beforeSnapshot: this.toBoxAuditSnapshot(before),
          afterSnapshot: this.toBoxAuditSnapshot(box),
          metadata: {
            inventoryItemId,
            outboundBoxItemId: deleted.id,
            customerId: box.customerId,
            warehouseId: box.warehouseId,
          },
        },
      });

      return { deleted, box };
    });
  }

  async clearBoxItems(boxId: string, inventoryItemIds: string[], operatorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.outboundBox.findUniqueOrThrow({
        where: { id: boxId },
        include: outboundBoxInclude,
      });
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

      await tx.auditLog.create({
        data: {
          action: AuditAction.OUTBOUND_BOX_ITEM_CLEAR,
          resourceType: 'outbound-box',
          resourceId: boxId,
          operatorId,
          beforeSnapshot: this.toBoxAuditSnapshot(before),
          afterSnapshot: this.toBoxAuditSnapshot(box),
          metadata: {
            clearedCount: result.count,
            inventoryItemIds,
            customerId: box.customerId,
            warehouseId: box.warehouseId,
          },
        },
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
          beforeSnapshot: this.toBoxAuditSnapshot(box),
          afterSnapshot: this.toBoxAuditSnapshot(sealed),
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

  async reopenBox(input: { boxId: string; operatorId: string }) {
    return this.prisma.$transaction(async (tx) => {
      const box = await tx.outboundBox.findUniqueOrThrow({
        where: { id: input.boxId },
        include: outboundBoxInclude,
      });
      const reopened = await tx.outboundBox.update({
        where: { id: box.id },
        data: {
          status: OutboundBoxStatus.OPEN,
          sealedAt: null,
        },
        include: outboundBoxInclude,
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.OUTBOUND_BOX_REOPEN,
          resourceType: 'outbound-box',
          resourceId: box.id,
          operatorId: input.operatorId,
          beforeSnapshot: this.toBoxAuditSnapshot(box),
          afterSnapshot: this.toBoxAuditSnapshot(reopened),
          metadata: {
            itemCount: box.items.length,
            customerId: box.customerId,
            warehouseId: box.warehouseId,
          },
        },
      });

      return reopened;
    });
  }

  async voidBox(input: { boxId: string; operatorId: string }) {
    return this.prisma.$transaction(async (tx) => {
      const box = await tx.outboundBox.findUniqueOrThrow({
        where: { id: input.boxId },
        include: outboundBoxInclude,
      });
      const inventoryItemIds = box.items.map((item) => item.inventoryItemId);

      if (inventoryItemIds.length) {
        await tx.outboundBoxItem.deleteMany({
          where: { outboundBoxId: box.id },
        });
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

      const voided = await tx.outboundBox.update({
        where: { id: box.id },
        data: {
          status: OutboundBoxStatus.VOIDED,
          sealedAt: null,
        },
        include: outboundBoxInclude,
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.OUTBOUND_BOX_DELETE,
          resourceType: 'outbound-box',
          resourceId: box.id,
          operatorId: input.operatorId,
          beforeSnapshot: this.toBoxAuditSnapshot(box),
          afterSnapshot: this.toBoxAuditSnapshot(voided),
          metadata: {
            returnedInventoryItemIds: inventoryItemIds,
            itemCount: inventoryItemIds.length,
            customerId: box.customerId,
            warehouseId: box.warehouseId,
          },
        },
      });

      return voided;
    });
  }

  private toBoxAuditSnapshot(box: OutboundBoxRecord) {
    return {
      boxId: box.id,
      boxNo: box.boxNo,
      boxName: box.boxName,
      sizePreset: box.sizePreset,
      customSize: box.customSize,
      weightLb: box.weightLb,
      status: box.status,
      sealedAt: box.sealedAt,
      itemIds: box.items.map((item) => item.inventoryItemId),
      notes: box.notes,
    };
  }
}
