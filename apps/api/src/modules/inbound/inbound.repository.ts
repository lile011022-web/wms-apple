import { Injectable } from '@nestjs/common';
import {
  ExceptionType,
  InboundBatchStatus,
  InboundItemStatus,
  InventoryStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const inboundBatchInclude = {
  customer: true,
  warehouse: true,
  operator: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  inboundItems: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      product: {
        include: {
          upcs: {
            orderBy: { upc: 'asc' as const },
          },
        },
      },
      exceptions: true,
      inventoryItem: true,
    },
  },
};

const inboundItemInclude = {
  inboundBatch: {
    include: {
      customer: true,
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
  customer: true,
  product: {
    include: {
      upcs: {
        orderBy: { upc: 'asc' as const },
      },
    },
  },
  exceptions: true,
  inventoryItem: true,
};

export type InboundDraftRecord = NonNullable<
  Awaited<ReturnType<InboundRepository['findDraftById']>>
>;
export type InboundItemRecord = NonNullable<Awaited<ReturnType<InboundRepository['findItemById']>>>;

@Injectable()
export class InboundRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCustomerById(id: string) {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  findWarehouseById(id: string) {
    return this.prisma.warehouse.findUnique({ where: { id } });
  }

  findProductByUpc(upc: string) {
    return this.prisma.productUpc.findUnique({
      where: { upc },
      include: {
        product: {
          include: {
            upcs: {
              orderBy: { upc: 'asc' },
            },
          },
        },
      },
    });
  }

  findInventoryByImei(imei: string) {
    return this.prisma.inventoryItem.findUnique({ where: { imei } });
  }

  findInventoryBySerial(serial: string) {
    return this.prisma.inventoryItem.findUnique({ where: { serial } });
  }

  countConfirmedItemsByUps(upsTrackingNo: string) {
    return this.prisma.inboundItem.count({
      where: {
        upsTrackingNo,
        status: InboundItemStatus.CONFIRMED,
      },
    });
  }

  createDraft(data: Prisma.InboundBatchCreateInput) {
    return this.prisma.inboundBatch.create({
      data,
      include: inboundBatchInclude,
    });
  }

  findDraftById(id: string) {
    return this.prisma.inboundBatch.findUnique({
      where: { id },
      include: inboundBatchInclude,
    });
  }

  createItem(data: Prisma.InboundItemCreateInput, exception?: Prisma.ExceptionRecordCreateInput) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inboundItem.create({
        data,
      });

      if (exception) {
        await tx.exceptionRecord.create({
          data: {
            ...exception,
            inboundItem: { connect: { id: item.id } },
          },
        });
      }

      return tx.inboundItem.findUniqueOrThrow({
        where: { id: item.id },
        include: inboundItemInclude,
      });
    });
  }

  findItemById(id: string) {
    return this.prisma.inboundItem.findUnique({
      where: { id },
      include: inboundItemInclude,
    });
  }

  deleteItem(id: string) {
    return this.prisma.inboundItem.update({
      where: { id },
      data: { status: InboundItemStatus.VOIDED },
      include: inboundItemInclude,
    });
  }

  clearDraftItems(draftId: string) {
    return this.prisma.inboundItem.updateMany({
      where: {
        inboundBatchId: draftId,
        status: { in: [InboundItemStatus.PENDING, InboundItemStatus.EXCEPTION] },
      },
      data: { status: InboundItemStatus.VOIDED },
    });
  }

  async confirmDraft(input: {
    draftId: string;
    operatorId: string;
    duplicateImeiExceptionEnabled: boolean;
    duplicateUpsExceptionEnabled: boolean;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.inboundBatch.findUniqueOrThrow({
        where: { id: input.draftId },
        include: inboundBatchInclude,
      });
      const confirmableItems = draft.inboundItems.filter(
        (item) => item.status === InboundItemStatus.PENDING && item.productId,
      );

      const duplicateItemIds = new Set<string>();
      for (const item of confirmableItems) {
        if (item.imei) {
          const existing = await tx.inventoryItem.findUnique({ where: { imei: item.imei } });
          if (existing) {
            duplicateItemIds.add(item.id);
            if (input.duplicateImeiExceptionEnabled) {
              await tx.exceptionRecord.create({
                data: {
                  type: ExceptionType.IMEI_DUPLICATED,
                  customerId: draft.customerId,
                  warehouseId: draft.warehouseId,
                  productId: item.productId,
                  inboundItemId: item.id,
                  inventoryItemId: existing.id,
                  rawValue: item.imei,
                  upsTrackingNo: item.upsTrackingNo,
                  upc: item.upc,
                  imei: item.imei,
                },
              });
            }
          }
        }

        if (item.serial) {
          const existing = await tx.inventoryItem.findUnique({ where: { serial: item.serial } });
          if (existing) {
            duplicateItemIds.add(item.id);
            if (input.duplicateImeiExceptionEnabled) {
              await tx.exceptionRecord.create({
                data: {
                  type: ExceptionType.IMEI_DUPLICATED,
                  customerId: draft.customerId,
                  warehouseId: draft.warehouseId,
                  productId: item.productId,
                  inboundItemId: item.id,
                  inventoryItemId: existing.id,
                  rawValue: item.serial,
                  upsTrackingNo: item.upsTrackingNo,
                  upc: item.upc,
                  serial: item.serial,
                },
              });
            }
          }
        }

        if (item.upsTrackingNo) {
          const duplicateUpsCount = await tx.inboundItem.count({
            where: {
              upsTrackingNo: item.upsTrackingNo,
              status: InboundItemStatus.CONFIRMED,
            },
          });
          if (duplicateUpsCount > 0) {
            duplicateItemIds.add(item.id);
            if (input.duplicateUpsExceptionEnabled) {
              await tx.exceptionRecord.create({
                data: {
                  type: ExceptionType.UPS_DUPLICATED,
                  customerId: draft.customerId,
                  warehouseId: draft.warehouseId,
                  productId: item.productId,
                  inboundItemId: item.id,
                  rawValue: item.upsTrackingNo,
                  upsTrackingNo: item.upsTrackingNo,
                  upc: item.upc,
                  imei: item.imei,
                  serial: item.serial,
                },
              });
            }
          }
        }
      }

      const confirmedItemIds: string[] = [];
      const inventoryIds: string[] = [];
      for (const item of confirmableItems) {
        if (duplicateItemIds.has(item.id) || !item.productId) {
          await tx.inboundItem.update({
            where: { id: item.id },
            data: { status: InboundItemStatus.EXCEPTION },
          });
          continue;
        }

        const inventoryItem = await tx.inventoryItem.create({
          data: {
            customerId: draft.customerId,
            warehouseId: draft.warehouseId,
            productId: item.productId,
            inboundBatchId: draft.id,
            imei: item.imei,
            serial: item.serial,
            upc: item.upc,
            upsTrackingNo: item.upsTrackingNo,
          },
        });

        await tx.inboundItem.update({
          where: { id: item.id },
          data: {
            status: InboundItemStatus.CONFIRMED,
            inventoryItemId: inventoryItem.id,
          },
        });
        confirmedItemIds.push(item.id);
        inventoryIds.push(inventoryItem.id);
      }

      await tx.inboundBatch.update({
        where: { id: draft.id },
        data: {
          status: InboundBatchStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'INBOUND_CONFIRM',
          resourceType: 'inbound-batch',
          resourceId: draft.id,
          operatorId: input.operatorId,
          afterSnapshot: {
            batchId: draft.id,
            batchNo: draft.batchNo,
            confirmedItemIds,
            inventoryIds,
            exceptionItemIds: [...duplicateItemIds],
          },
          metadata: {
            confirmedCount: confirmedItemIds.length,
            exceptionCount: duplicateItemIds.size,
          },
        },
      });

      return tx.inboundBatch.findUniqueOrThrow({
        where: { id: draft.id },
        include: inboundBatchInclude,
      });
    });
  }

  findRecords(params: {
    skip: number;
    take: number;
    search?: string;
    batchId?: string;
    customerId?: string;
    warehouseId?: string;
    status?: InboundItemStatus;
    inventoryStatus?: InventoryStatus;
    upsTrackingNo?: string;
    upc?: string;
    imei?: string;
    serial?: string;
    dateFrom?: Date;
    dateTo?: Date;
    orderBy: Prisma.InboundItemOrderByWithRelationInput;
  }) {
    const where = this.toRecordWhere(params);
    return this.prisma.$transaction([
      this.prisma.inboundItem.count({ where }),
      this.prisma.inboundItem.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
        include: inboundItemInclude,
      }),
    ]);
  }

  countRecords(params: {
    search?: string;
    batchId?: string;
    customerId?: string;
    warehouseId?: string;
    status?: InboundItemStatus;
    inventoryStatus?: InventoryStatus;
    upsTrackingNo?: string;
    upc?: string;
    imei?: string;
    serial?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }) {
    return this.prisma.inboundItem.count({ where: this.toRecordWhere(params) });
  }

  findRecordItemsByBatchId(params: {
    batchId: string;
    skip: number;
    take: number;
    orderBy: Prisma.InboundItemOrderByWithRelationInput;
  }) {
    const where = { inboundBatchId: params.batchId };
    return this.prisma.$transaction([
      this.prisma.inboundItem.count({ where }),
      this.prisma.inboundItem.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
        include: inboundItemInclude,
      }),
    ]);
  }

  private toRecordWhere(params: {
    search?: string;
    batchId?: string;
    customerId?: string;
    warehouseId?: string;
    status?: InboundItemStatus;
    inventoryStatus?: InventoryStatus;
    upsTrackingNo?: string;
    upc?: string;
    imei?: string;
    serial?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Prisma.InboundItemWhereInput {
    return {
      inboundBatchId: params.batchId,
      customerId: params.customerId,
      inboundBatch: {
        warehouseId: params.warehouseId,
      },
      status: params.status,
      inventoryItem: params.inventoryStatus ? { status: params.inventoryStatus } : undefined,
      upsTrackingNo: params.upsTrackingNo
        ? { contains: params.upsTrackingNo, mode: 'insensitive' }
        : undefined,
      upc: params.upc ? { contains: params.upc } : undefined,
      imei: params.imei ? { contains: params.imei } : undefined,
      serial: params.serial ? { contains: params.serial, mode: 'insensitive' } : undefined,
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
            { customer: { name: { contains: params.search, mode: 'insensitive' } } },
            { customer: { code: { contains: params.search, mode: 'insensitive' } } },
            { product: { sku: { contains: params.search, mode: 'insensitive' } } },
            { product: { name: { contains: params.search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
  }
}
