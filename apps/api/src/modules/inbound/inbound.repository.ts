import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  ExceptionStatus,
  ExceptionType,
  InboundBatchStatus,
  InboundItemStatus,
  InventoryStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const inboundBatchInclude = {
  customer: true,
  customerAlias: true,
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
      customerAlias: true,
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
  customerAlias: true,
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

export type InboundDraftAccess = {
  draftId: string;
  operatorId: string;
  sessionId: string;
};

type LockedInboundDraft = {
  id: string;
  operatorId: string;
  creatorSessionId: string | null;
  status: InboundBatchStatus;
};

@Injectable()
export class InboundRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCustomerById(id: string) {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  findCustomerAliasById(id: string) {
    return this.prisma.customerAlias.findUnique({ where: { id }, include: { customer: true } });
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

  countDraftItemsByUps(draftId: string, upsTrackingNo: string) {
    return this.prisma.inboundItem.count({
      where: {
        inboundBatchId: draftId,
        upsTrackingNo,
        status: {
          not: InboundItemStatus.VOIDED,
        },
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

  findDraftByBatchNo(batchNo: string) {
    return this.prisma.inboundBatch.findUnique({
      where: { batchNo },
      include: inboundBatchInclude,
    });
  }

  findLatestDraftByOperatorSession(operatorId: string, sessionId: string) {
    return this.prisma.inboundBatch.findFirst({
      where: {
        operatorId,
        creatorSessionId: sessionId,
        status: InboundBatchStatus.DRAFT,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      include: inboundBatchInclude,
    });
  }

  claimDraftSession(draftId: string, operatorId: string, sessionId: string) {
    return this.prisma.inboundBatch.updateMany({
      where: {
        id: draftId,
        operatorId,
        creatorSessionId: null,
        status: InboundBatchStatus.DRAFT,
      },
      data: { creatorSessionId: sessionId },
    });
  }

  async claimLatestLegacyDraft(operatorId: string, sessionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const legacyDraft = await tx.inboundBatch.findFirst({
        where: {
          operatorId,
          creatorSessionId: null,
          status: InboundBatchStatus.DRAFT,
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      if (!legacyDraft) {
        return null;
      }

      const claimed = await tx.inboundBatch.updateMany({
        where: {
          id: legacyDraft.id,
          operatorId,
          creatorSessionId: null,
          status: InboundBatchStatus.DRAFT,
        },
        data: { creatorSessionId: sessionId },
      });
      if (claimed.count !== 1) {
        return null;
      }

      return tx.inboundBatch.findUniqueOrThrow({
        where: { id: legacyDraft.id },
        include: inboundBatchInclude,
      });
    });
  }

  createItem(
    data: Prisma.InboundItemCreateInput,
    exception: Prisma.ExceptionRecordCreateInput | undefined,
    access: InboundDraftAccess,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockOwnedOpenDraft(tx, access);
        await this.assertNoConcurrentDraftIdentity(
          tx,
          access.draftId,
          typeof data.imei === 'string' ? data.imei : undefined,
          typeof data.serial === 'string' ? data.serial : undefined,
        );

        const item = await tx.inboundItem.create({ data });
        await tx.inboundBatch.update({
          where: { id: item.inboundBatchId },
          data: { updatedAt: new Date() },
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
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  updateItem(
    id: string,
    data: Prisma.InboundItemUpdateInput,
    exception: Prisma.ExceptionRecordCreateInput | undefined,
    access: InboundDraftAccess,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockOwnedOpenDraft(tx, access);
        const existing = await tx.inboundItem.findUnique({ where: { id } });
        if (!existing || existing.inboundBatchId !== access.draftId) {
          throw new NotFoundException('Inbound draft item not found.');
        }
        if (
          existing.status !== InboundItemStatus.PENDING &&
          existing.status !== InboundItemStatus.EXCEPTION
        ) {
          throw new ConflictException('Only pending or exception draft items can be corrected.');
        }
        await this.assertNoConcurrentDraftIdentity(
          tx,
          access.draftId,
          typeof data.imei === 'string' ? data.imei : undefined,
          typeof data.serial === 'string' ? data.serial : undefined,
          id,
        );

        const resolvedAt = new Date();
        await tx.exceptionRecord.updateMany({
          where: {
            inboundItemId: id,
            status: ExceptionStatus.OPEN,
          },
          data: {
            status: ExceptionStatus.INVALID,
            resolutionNote: 'Inbound draft row corrected.',
            resolvedAt,
          },
        });

        const item = await tx.inboundItem.update({ where: { id }, data });
        await tx.inboundBatch.update({
          where: { id: item.inboundBatchId },
          data: { updatedAt: new Date() },
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
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  findItemById(id: string) {
    return this.prisma.inboundItem.findUnique({
      where: { id },
      include: inboundItemInclude,
    });
  }

  deleteItem(id: string, access: InboundDraftAccess) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockOwnedOpenDraft(tx, access);
        const existing = await tx.inboundItem.findUnique({ where: { id } });
        if (!existing || existing.inboundBatchId !== access.draftId) {
          throw new NotFoundException('Inbound draft item not found.');
        }
        if (existing.status === InboundItemStatus.CONFIRMED) {
          throw new ConflictException('Confirmed inbound item cannot be removed.');
        }

        const item = await tx.inboundItem.update({
          where: { id },
          data: { status: InboundItemStatus.VOIDED },
        });
        await tx.inboundBatch.update({
          where: { id: item.inboundBatchId },
          data: { updatedAt: new Date() },
        });
        return tx.inboundItem.findUniqueOrThrow({
          where: { id },
          include: inboundItemInclude,
        });
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  clearDraftItems(access: InboundDraftAccess) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockOwnedOpenDraft(tx, access);
        const result = await tx.inboundItem.updateMany({
          where: {
            inboundBatchId: access.draftId,
            status: { in: [InboundItemStatus.PENDING, InboundItemStatus.EXCEPTION] },
          },
          data: { status: InboundItemStatus.VOIDED },
        });
        await tx.inboundBatch.update({
          where: { id: access.draftId },
          data: { updatedAt: new Date() },
        });
        return result;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  async confirmDraft(input: {
    draftId: string;
    operatorId: string;
    sessionId: string;
    duplicateImeiExceptionEnabled: boolean;
    duplicateUpsExceptionEnabled: boolean;
    packagePrealertsEnabled?: boolean;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockOwnedOpenDraft(tx, {
          draftId: input.draftId,
          operatorId: input.operatorId,
          sessionId: input.sessionId,
        });
        const draft = await tx.inboundBatch.findUniqueOrThrow({
          where: { id: input.draftId },
          include: inboundBatchInclude,
        });
        const confirmableItems = draft.inboundItems.filter(
          (item) => item.status === InboundItemStatus.PENDING && item.productId,
        );
        if (confirmableItems.length === 0) {
          throw new BadRequestException('Inbound draft has no confirmable items.');
        }

        const duplicateItemIds = new Set<string>();
        const duplicateImeis = new Set<string>();
        const duplicateSerials = new Set<string>();
        for (const item of confirmableItems) {
          if (item.imei) {
            const existing = await tx.inventoryItem.findUnique({ where: { imei: item.imei } });
            if (existing) {
              duplicateImeis.add(item.imei);
              duplicateItemIds.add(item.id);
            }
          }

          if (item.serial) {
            const existing = await tx.inventoryItem.findUnique({ where: { serial: item.serial } });
            if (existing) {
              duplicateSerials.add(item.serial);
              duplicateItemIds.add(item.id);
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

        if (duplicateImeis.size > 0) {
          throw new BadRequestException(
            `IMEI 已存在库存记录，不能重复入库: ${[...duplicateImeis].join(', ')}。请修正或删除重复明细后再确认入库。`,
          );
        }

        if (duplicateSerials.size > 0) {
          throw new BadRequestException(
            `Serial 已存在库存记录，不能重复入库: ${[...duplicateSerials].join(', ')}。请修正或删除重复明细后再确认入库。`,
          );
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

          const inventoryItem = await this.createInventoryItemOrThrowReadableIdentityConflict(tx, {
            customerId: draft.customerId,
            customerAliasId: draft.customerAliasId,
            warehouseId: draft.warehouseId,
            productId: item.productId,
            inboundBatchId: draft.id,
            imei: item.imei,
            serial: item.serial,
            upc: item.upc,
            upsTrackingNo: item.upsTrackingNo,
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

        if (input.packagePrealertsEnabled) {
          const firstConfirmedItemByTrackingNo = new Map<string, string>();
          for (const item of confirmableItems) {
            if (item.upsTrackingNo && confirmedItemIds.includes(item.id)) {
              firstConfirmedItemByTrackingNo.set(
                item.upsTrackingNo,
                firstConfirmedItemByTrackingNo.get(item.upsTrackingNo) ?? item.id,
              );
            }
          }

          for (const [trackingNo, inboundItemId] of firstConfirmedItemByTrackingNo.entries()) {
            const prealertItem = await tx.packagePrealertItem.findFirst({
              where: {
                trackingNo,
                receivingStatus: 'NOT_RECEIVED',
              },
              orderBy: { createdAt: 'desc' },
            });
            if (!prealertItem) {
              continue;
            }
            await tx.packagePrealertItem.update({
              where: { id: prealertItem.id },
              data: {
                receivingStatus: 'RECEIVED',
                inboundBatchId: draft.id,
                inboundItemId,
              },
            });
            await tx.packageAlert.updateMany({
              where: {
                prealertItemId: prealertItem.id,
                status: { in: ['OPEN', 'IN_PROGRESS'] },
                alertType: { in: ['DELIVERED_NOT_RECEIVED', 'ETA_OVERDUE'] },
              },
              data: {
                status: 'RESOLVED',
                resolvedAt: new Date(),
                resolutionNote: 'Package linked to confirmed inbound batch.',
              },
            });
          }
        }

        return tx.inboundBatch.findUniqueOrThrow({
          where: { id: draft.id },
          include: inboundBatchInclude,
        });
      },
      {
        maxWait: 10_000,
        timeout: 120_000,
      },
    );
  }

  private async lockOwnedOpenDraft(tx: Prisma.TransactionClient, access: InboundDraftAccess) {
    const rows = await tx.$queryRaw<LockedInboundDraft[]>(Prisma.sql`
      SELECT "id", "operatorId", "creatorSessionId", "status"
      FROM "inbound_batches"
      WHERE "id" = ${access.draftId}
      FOR UPDATE
    `);
    const draft = rows[0];
    if (!draft) {
      throw new NotFoundException('Inbound draft not found.');
    }
    if (draft.operatorId !== access.operatorId) {
      throw new ForbiddenException('Inbound draft belongs to another operator.');
    }
    if (draft.status !== InboundBatchStatus.DRAFT) {
      throw new ConflictException('Inbound draft is already closed.');
    }

    if (!draft.creatorSessionId) {
      await tx.inboundBatch.update({
        where: { id: draft.id },
        data: { creatorSessionId: access.sessionId },
      });
      return;
    }
    if (draft.creatorSessionId !== access.sessionId) {
      throw new ForbiddenException('Inbound draft belongs to another login session.');
    }
  }

  private async assertNoConcurrentDraftIdentity(
    tx: Prisma.TransactionClient,
    draftId: string,
    imei?: string,
    serial?: string,
    excludeItemId?: string,
  ) {
    if (!imei && !serial) {
      return;
    }

    const identityFilters: Prisma.InboundItemWhereInput[] = [];
    if (imei) {
      identityFilters.push({ imei });
    }
    if (serial) {
      identityFilters.push({ serial });
    }

    const duplicate = await tx.inboundItem.findFirst({
      where: {
        inboundBatchId: draftId,
        id: excludeItemId ? { not: excludeItemId } : undefined,
        status: { not: InboundItemStatus.VOIDED },
        OR: identityFilters,
      },
      select: { id: true },
    });
    if (!duplicate) {
      return;
    }
    if (imei) {
      throw new BadRequestException(
        `当前入库单内 IMEI 已重复: ${imei}。请修正或删除重复明细后再继续入库。`,
      );
    }
    throw new BadRequestException(
      `当前入库单内 Serial 已重复: ${serial}。请修正或删除重复明细后再继续入库。`,
    );
  }

  private async createInventoryItemOrThrowReadableIdentityConflict(
    tx: Prisma.TransactionClient,
    data: {
      customerId: string;
      customerAliasId: string | null;
      warehouseId: string;
      productId: string;
      inboundBatchId: string;
      imei: string | null;
      serial: string | null;
      upc: string;
      upsTrackingNo: string | null;
    },
  ) {
    try {
      return await tx.inventoryItem.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : '';
        if (target.includes('imei') && data.imei) {
          throw new BadRequestException(
            `IMEI 已存在库存记录，不能重复入库: ${data.imei}。请修正或删除重复明细后再确认入库。`,
          );
        }
        if (target.includes('serial') && data.serial) {
          throw new BadRequestException(
            `Serial 已存在库存记录，不能重复入库: ${data.serial}。请修正或删除重复明细后再确认入库。`,
          );
        }
      }

      throw error;
    }
  }

  async forceConfirmItem(input: { itemId: string; operatorId: string; reason: string }) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inboundItem.findUniqueOrThrow({
        where: { id: input.itemId },
        include: inboundItemInclude,
      });
      if (!item.productId) {
        throw new Error('Force inbound requires a matched product.');
      }

      const inventoryItem = await tx.inventoryItem.create({
        data: {
          customerId: item.customerId,
          customerAliasId: item.customerAliasId,
          warehouseId: item.inboundBatch.warehouseId,
          productId: item.productId,
          inboundBatchId: item.inboundBatchId,
          imei: item.imei,
          serial: item.serial,
          upc: item.upc,
          upsTrackingNo: item.upsTrackingNo,
        },
      });
      const forcedAt = new Date();

      await tx.exceptionRecord.updateMany({
        where: {
          inboundItemId: item.id,
          status: ExceptionStatus.OPEN,
        },
        data: {
          status: ExceptionStatus.RESOLVED,
          resolutionNote: `Force inbound: ${input.reason}`,
          resolvedById: input.operatorId,
          resolvedAt: forcedAt,
        },
      });

      const updated = await tx.inboundItem.update({
        where: { id: item.id },
        data: {
          status: InboundItemStatus.CONFIRMED,
          inventoryItemId: inventoryItem.id,
          forcedInbound: true,
          forceReason: input.reason,
          forcedAt,
          forcedById: input.operatorId,
        },
        include: inboundItemInclude,
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.INBOUND_FORCE_CONFIRM,
          resourceType: 'inbound-item',
          resourceId: item.id,
          operatorId: input.operatorId,
          beforeSnapshot: {
            status: item.status,
            inventoryItemId: item.inventoryItemId,
            exceptions: item.exceptions.map((exception) => ({
              id: exception.id,
              type: exception.type,
              status: exception.status,
            })),
          },
          afterSnapshot: {
            status: updated.status,
            inventoryItemId: inventoryItem.id,
            forcedInbound: updated.forcedInbound,
            forcedAt,
          },
          metadata: {
            reason: input.reason,
            batchId: item.inboundBatchId,
            customerId: item.customerId,
            warehouseId: item.inboundBatch.warehouseId,
            productId: item.productId,
            inventoryItemId: inventoryItem.id,
          },
        },
      });

      return updated;
    });
  }

  async correctRecordUpc(input: {
    itemId: string;
    inventoryItemId?: string;
    operatorId: string;
    upsTrackingNo?: string;
    upc: string;
    imei?: string;
    serial?: string;
    productId: string;
    reason: string;
    forceReason?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inboundItem.findUniqueOrThrow({
        where: { id: input.itemId },
        include: inboundItemInclude,
      });
      if (item.inboundBatch.status === InboundBatchStatus.DRAFT) {
        throw new BadRequestException(
          '当前入库单还未确认，请回到入库扫码页面编辑或删除这条明细后再确认入库。',
        );
      }
      const existingInventoryItem = input.inventoryItemId
        ? await tx.inventoryItem.findUniqueOrThrow({
            where: { id: input.inventoryItemId },
            include: { product: true },
          })
        : null;

      const inventoryItem =
        existingInventoryItem ??
        (await tx.inventoryItem.create({
          data: {
            customerId: item.customerId,
            customerAliasId: item.customerAliasId,
            warehouseId: item.inboundBatch.warehouseId,
            productId: input.productId,
            inboundBatchId: item.inboundBatchId,
            imei: input.imei,
            serial: input.serial,
            upc: input.upc,
            upsTrackingNo: input.upsTrackingNo,
          },
        }));

      if (existingInventoryItem) {
        await tx.inventoryItem.update({
          where: { id: existingInventoryItem.id },
          data: {
            customerAliasId: item.customerAliasId,
            upsTrackingNo: input.upsTrackingNo,
            upc: input.upc,
            imei: input.imei ?? null,
            serial: input.serial ?? null,
            productId: input.productId,
          },
        });
      }

      const correctedAt = new Date();
      await tx.exceptionRecord.updateMany({
        where: {
          inboundItemId: item.id,
          status: ExceptionStatus.OPEN,
        },
        data: {
          status: ExceptionStatus.RESOLVED,
          resolutionNote: `Inbound record corrected: ${input.reason}`,
          resolvedById: input.operatorId,
          resolvedAt: correctedAt,
        },
      });

      const updatedItem = await tx.inboundItem.update({
        where: { id: input.itemId },
        data: {
          upsTrackingNo: input.upsTrackingNo,
          upc: input.upc,
          imei: input.imei ?? null,
          serial: input.serial ?? null,
          productId: input.productId,
          inventoryItemId: inventoryItem.id,
          status: InboundItemStatus.CONFIRMED,
          forceReason: input.forceReason,
        },
        include: inboundItemInclude,
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.INBOUND_RECORD_CORRECTION,
          resourceType: 'inbound-item',
          resourceId: item.id,
          operatorId: input.operatorId,
          beforeSnapshot: {
            inboundItem: {
              upsTrackingNo: item.upsTrackingNo,
              upc: item.upc,
              imei: item.imei,
              serial: item.serial,
              status: item.status,
              productId: item.productId,
              forceReason: item.forceReason,
            },
            inventoryItem: existingInventoryItem
              ? {
                  id: existingInventoryItem.id,
                  upsTrackingNo: existingInventoryItem.upsTrackingNo,
                  upc: existingInventoryItem.upc,
                  imei: existingInventoryItem.imei,
                  serial: existingInventoryItem.serial,
                  productId: existingInventoryItem.productId,
                  status: existingInventoryItem.status,
                }
              : null,
          },
          afterSnapshot: {
            inboundItem: {
              upsTrackingNo: updatedItem.upsTrackingNo,
              upc: updatedItem.upc,
              imei: updatedItem.imei,
              serial: updatedItem.serial,
              status: updatedItem.status,
              productId: updatedItem.productId,
              forceReason: updatedItem.forceReason,
            },
            inventoryItem: {
              id: inventoryItem.id,
              upsTrackingNo: input.upsTrackingNo,
              upc: input.upc,
              imei: input.imei,
              serial: input.serial,
              productId: input.productId,
              status: inventoryItem.status,
            },
          },
          metadata: {
            reason: input.reason,
            batchId: item.inboundBatchId,
            customerId: item.customerId,
            warehouseId: item.inboundBatch.warehouseId,
            inventoryItemId: inventoryItem.id,
            createdInventory: !existingInventoryItem,
            beforeProductName: item.product?.name,
            afterProductId: input.productId,
          },
        },
      });

      return updatedItem;
    });
  }

  findRecords(params: {
    skip: number;
    take: number;
    search?: string;
    batchId?: string;
    customerId?: string;
    customerAliasId?: string;
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
    customerAliasId?: string;
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
    customerAliasId?: string;
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
      customerAliasId: params.customerAliasId,
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
      OR: this.toRecordSearchWhere(params.search),
    };
  }

  private toRecordSearchWhere(search?: string): Prisma.InboundItemWhereInput[] | undefined {
    if (!search) {
      return undefined;
    }

    const identitySuffix = this.toIdentitySuffix(search);
    const searchWhere: Prisma.InboundItemWhereInput[] = [
      { upsTrackingNo: { contains: search, mode: 'insensitive' } },
      { upc: { contains: search } },
      { imei: { contains: search } },
      { serial: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
      { customer: { code: { contains: search, mode: 'insensitive' } } },
      { customerAlias: { name: { contains: search, mode: 'insensitive' } } },
      { customerAlias: { code: { contains: search, mode: 'insensitive' } } },
      { product: { sku: { contains: search, mode: 'insensitive' } } },
      { product: { name: { contains: search, mode: 'insensitive' } } },
    ];

    if (identitySuffix) {
      searchWhere.push(
        { imei: { endsWith: identitySuffix } },
        { serial: { endsWith: identitySuffix, mode: 'insensitive' } },
      );
    }

    return searchWhere;
  }

  private toIdentitySuffix(search: string) {
    const normalized = search.trim().toUpperCase();
    return /^[A-Z0-9]{6}$/.test(normalized) ? normalized : undefined;
  }
}
