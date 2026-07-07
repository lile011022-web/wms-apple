import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CustomerStatus,
  PackageAlertSeverity,
  PackageAlertStatus,
  PackageAlertType,
  PackageCarrier,
  PackageExchangePushStatus,
  PackageLogisticsStatus,
  PackageReceivingStatus,
  Prisma,
} from '@prisma/client';
import { normalizePackageTracking } from '@wms-scan/shared';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CreatePackagePrealertBatchDto,
  CreatePackagePrealertItemDto,
} from './dto/create-package-prealert-batch.dto';
import { HandlePackageAlertDto } from './dto/handle-package-alert.dto';
import {
  ListPackageAlertsQueryDto,
  ListPackagePrealertsQueryDto,
} from './dto/list-package-prealerts-query.dto';
import { UpdatePackagePrealertStatusDto } from './dto/update-package-prealert-status.dto';

const itemInclude = {
  batch: true,
  customer: true,
  inboundBatch: true,
  inboundItem: true,
  events: {
    orderBy: { createdAt: 'desc' as const },
    take: 8,
  },
  alerts: {
    orderBy: { triggeredAt: 'desc' as const },
    take: 5,
  },
};

@Injectable()
export class PackagePrealertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async createBatch(dto: CreatePackagePrealertBatchDto, operator: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }
    if (customer.status !== CustomerStatus.ACTIVE) {
      throw new ConflictException('Inactive customer cannot create package prealerts.');
    }

    const preparedItems = dto.items.map((item) => this.prepareItem(item));
    if (preparedItems.length === 0) {
      throw new BadRequestException('At least one package tracking number is required.');
    }

    const batch = await this.prisma.$transaction(async (tx) => {
      const createdBatch = await tx.packagePrealertBatch.create({
        data: {
          batchNo: this.generateBatchNo(),
          customerId: customer.id,
          source: this.trimOptional(dto.source) ?? 'MANUAL',
          notes: this.trimOptional(dto.notes),
          createdById: operator.id,
        },
      });

      for (const item of preparedItems) {
        const existing = await tx.packagePrealertItem.findMany({
          where: {
            trackingNo: item.trackingNo,
            receivingStatus: { not: PackageReceivingStatus.VOIDED },
          },
          include: { customer: true },
        });
        const prealertItem = await tx.packagePrealertItem.create({
          data: {
            batchId: createdBatch.id,
            customerId: customer.id,
            carrier: item.carrier,
            trackingNo: item.trackingNo,
            originalTrackingLink: item.originalTrackingLink,
            estimatedArrivalAt: item.estimatedArrivalAt,
            productModel: item.productModel,
            recipientName: item.recipientName,
            notes: item.notes,
          },
        });
        await tx.packageTrackingEvent.create({
          data: {
            prealertItemId: prealertItem.id,
            status: PackageLogisticsStatus.UNKNOWN,
            rawStatus: 'Package prealert created.',
            estimatedArrivalAt: item.estimatedArrivalAt,
            source: 'MANUAL',
          },
        });
        if (existing.some((row) => row.customerId !== customer.id)) {
          await tx.packageAlert.create({
            data: {
              prealertItemId: prealertItem.id,
              alertType: PackageAlertType.CUSTOMER_CONFLICT,
              severity: PackageAlertSeverity.CRITICAL,
            },
          });
        } else if (existing.length > 0) {
          await tx.packageAlert.create({
            data: {
              prealertItemId: prealertItem.id,
              alertType: PackageAlertType.DUPLICATE_PREALERT,
              severity: PackageAlertSeverity.WARNING,
            },
          });
        }
      }

      return tx.packagePrealertBatch.findUniqueOrThrow({
        where: { id: createdBatch.id },
        include: {
          customer: true,
          createdBy: { select: { id: true, name: true, email: true } },
          items: true,
        },
      });
    });

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.PACKAGE_PREALERT_CHANGE,
      resourceType: 'package-prealert-batch',
      resourceId: batch.id,
      afterSnapshot: {
        batchNo: batch.batchNo,
        customerId: batch.customerId,
        itemCount: batch.items.length,
      },
    });

    return this.toBatchResponse(batch);
  }

  async list(query: ListPackagePrealertsQueryDto) {
    const where = this.toItemWhere(query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.packagePrealertItem.count({ where }),
      this.prisma.packagePrealertItem.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: itemInclude,
      }),
    ]);

    await this.refreshOpenAlertsForItems(items.map((item) => item.id));

    return {
      items: items.map((item) => this.toItemResponse(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async listAlerts(query: ListPackageAlertsQueryDto) {
    await this.refreshOpenAlertsForItems();
    const where: Prisma.PackageAlertWhereInput = {
      status: query.status,
      alertType: query.alertType,
      prealertItem: {
        customerId: this.trimOptional(query.customerId),
        OR: this.toSearchWhere(query.search),
      },
    };
    const [total, alerts] = await this.prisma.$transaction([
      this.prisma.packageAlert.count({ where }),
      this.prisma.packageAlert.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { triggeredAt: 'desc' },
        include: { prealertItem: { include: itemInclude } },
      }),
    ]);

    return {
      items: alerts.map((alert) => this.toAlertResponse(alert)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async summary() {
    await this.refreshOpenAlertsForItems();
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const [
      totalOpen,
      todayExpected,
      deliveredNotReceived,
      etaOverdue,
      criticalAlerts,
      nextArrivals,
    ] = await this.prisma.$transaction([
      this.prisma.packagePrealertItem.count({
        where: { receivingStatus: PackageReceivingStatus.NOT_RECEIVED },
      }),
      this.prisma.packagePrealertItem.count({
        where: {
          estimatedArrivalAt: { gte: startOfToday, lte: endOfToday },
          receivingStatus: PackageReceivingStatus.NOT_RECEIVED,
        },
      }),
      this.prisma.packageAlert.count({
        where: {
          alertType: PackageAlertType.DELIVERED_NOT_RECEIVED,
          status: { in: [PackageAlertStatus.OPEN, PackageAlertStatus.IN_PROGRESS] },
        },
      }),
      this.prisma.packageAlert.count({
        where: {
          alertType: PackageAlertType.ETA_OVERDUE,
          status: { in: [PackageAlertStatus.OPEN, PackageAlertStatus.IN_PROGRESS] },
        },
      }),
      this.prisma.packageAlert.count({
        where: {
          severity: PackageAlertSeverity.CRITICAL,
          status: { in: [PackageAlertStatus.OPEN, PackageAlertStatus.IN_PROGRESS] },
        },
      }),
      this.prisma.packagePrealertItem.findMany({
        where: {
          estimatedArrivalAt: { gte: now },
          receivingStatus: PackageReceivingStatus.NOT_RECEIVED,
        },
        take: 8,
        orderBy: { estimatedArrivalAt: 'asc' },
        include: itemInclude,
      }),
    ]);

    return {
      totalOpen,
      todayExpected,
      deliveredNotReceived,
      etaOverdue,
      criticalAlerts,
      nextArrivals: nextArrivals.map((item) => this.toItemResponse(item)),
    };
  }

  async matchTracking(rawTrackingNo: string) {
    const trackingNo = this.normalizeTracking(rawTrackingNo);
    const items = await this.prisma.packagePrealertItem.findMany({
      where: {
        trackingNo,
        receivingStatus: { not: PackageReceivingStatus.VOIDED },
      },
      include: itemInclude,
      orderBy: { createdAt: 'desc' },
    });
    const activeItems = items.filter(
      (item) =>
        !item.alerts.some(
          (alert) =>
            alert.alertType === PackageAlertType.CUSTOMER_CONFLICT &&
            this.isOpenAlertStatus(alert.status),
        ),
    );
    const customerIds = new Set(activeItems.map((item) => item.customerId));

    if (items.length === 0) {
      return { matched: false, reason: 'NOT_FOUND', trackingNo };
    }
    if (customerIds.size !== 1) {
      return {
        matched: false,
        reason: 'CUSTOMER_CONFLICT',
        trackingNo,
        candidates: items.map((item) => this.toItemResponse(item)),
      };
    }

    const item = activeItems[0];
    if (!item || item.customer.status !== CustomerStatus.ACTIVE) {
      return { matched: false, reason: 'CUSTOMER_INACTIVE', trackingNo };
    }

    return {
      matched: true,
      trackingNo,
      customer: this.toCustomerResponse(item.customer),
      prealert: this.toItemResponse(item),
    };
  }

  async updateStatus(id: string, dto: UpdatePackagePrealertStatusDto, operator: AuthenticatedUser) {
    const before = await this.prisma.packagePrealertItem.findUnique({
      where: { id },
      include: itemInclude,
    });
    if (!before) {
      throw new NotFoundException('Package prealert item not found.');
    }

    const logisticsStatus = dto.logisticsStatus ?? before.logisticsStatus;
    const logisticsUpdatedAt = dto.logisticsUpdatedAt
      ? new Date(dto.logisticsUpdatedAt)
      : new Date();
    const deliveredAt =
      dto.deliveredAt || logisticsStatus === PackageLogisticsStatus.DELIVERED
        ? new Date(dto.deliveredAt ?? dto.logisticsUpdatedAt ?? Date.now())
        : before.deliveredAt;

    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.packagePrealertItem.update({
        where: { id },
        data: {
          logisticsStatus,
          rawLogisticsStatus: this.trimOptional(dto.rawLogisticsStatus),
          logisticsUpdatedAt,
          estimatedArrivalAt:
            dto.estimatedArrivalAt === undefined
              ? before.estimatedArrivalAt
              : new Date(dto.estimatedArrivalAt),
          deliveredAt,
        },
        include: itemInclude,
      });
      await tx.packageTrackingEvent.create({
        data: {
          prealertItemId: id,
          status: logisticsStatus,
          rawStatus: this.trimOptional(dto.rawLogisticsStatus),
          eventTime: logisticsUpdatedAt,
          estimatedArrivalAt:
            dto.estimatedArrivalAt === undefined
              ? before.estimatedArrivalAt
              : new Date(dto.estimatedArrivalAt),
          location: this.trimOptional(dto.location),
          source: 'MANUAL',
        },
      });
      return item;
    });

    await this.ensureAlerts(updated.id);
    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.PACKAGE_PREALERT_STATUS_UPDATE,
      resourceType: 'package-prealert-item',
      resourceId: updated.id,
      beforeSnapshot: this.toItemResponse(before),
      afterSnapshot: this.toItemResponse(updated),
    });

    return this.toItemResponse(
      (await this.prisma.packagePrealertItem.findUniqueOrThrow({
        where: { id },
        include: itemInclude,
      })) as ItemRecord,
    );
  }

  async deleteItem(id: string, operator: AuthenticatedUser) {
    const before = await this.prisma.packagePrealertItem.findUnique({
      where: { id },
      include: itemInclude,
    });
    if (!before) {
      throw new NotFoundException('Package prealert item not found.');
    }
    if (before.receivingStatus === PackageReceivingStatus.VOIDED) {
      throw new ConflictException('Package prealert has already been deleted.');
    }
    if (
      before.receivingStatus === PackageReceivingStatus.RECEIVED ||
      before.inboundBatchId ||
      before.inboundItemId
    ) {
      throw new ConflictException('Received package prealerts cannot be deleted.');
    }

    const reason = 'Operator deleted package prealert from WMS page.';
    const deleted = await this.prisma.$transaction(async (tx) => {
      const item = await tx.packagePrealertItem.update({
        where: { id },
        data: {
          receivingStatus: PackageReceivingStatus.VOIDED,
          voidReason: reason,
          exchangePushStatus:
            before.exchangePushStatus === PackageExchangePushStatus.PUSHED
              ? before.exchangePushStatus
              : PackageExchangePushStatus.SKIPPED,
        },
        include: itemInclude,
      });
      await tx.packageAlert.updateMany({
        where: {
          prealertItemId: id,
          status: { in: [PackageAlertStatus.OPEN, PackageAlertStatus.IN_PROGRESS] },
        },
        data: {
          status: PackageAlertStatus.IGNORED,
          resolvedAt: new Date(),
          resolutionNote: reason,
        },
      });
      await tx.packageTrackingEvent.create({
        data: {
          prealertItemId: id,
          status: item.logisticsStatus,
          rawStatus: reason,
          eventTime: new Date(),
          source: 'MANUAL',
        },
      });
      return item;
    });

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.PACKAGE_PREALERT_CHANGE,
      resourceType: 'package-prealert-item',
      resourceId: deleted.id,
      beforeSnapshot: this.toItemResponse(before),
      afterSnapshot: this.toItemResponse(deleted),
      metadata: {
        operation: 'package_prealert_delete',
        voidReason: reason,
      },
    });

    return {
      deletedPrealertId: deleted.id,
      item: this.toItemResponse(deleted),
    };
  }

  async deleteItems(ids: string[], operator: AuthenticatedUser) {
    const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('At least one package prealert item id is required.');
    }

    const beforeItems = await this.prisma.packagePrealertItem.findMany({
      where: { id: { in: uniqueIds } },
      include: itemInclude,
    });
    const beforeById = new Map(beforeItems.map((item) => [item.id, item]));
    const skipped: Array<{ id: string; trackingNo?: string; reason: string }> = [];
    const deletable: ItemRecord[] = [];

    for (const id of uniqueIds) {
      const before = beforeById.get(id);
      if (!before) {
        skipped.push({ id, reason: '预报不存在' });
        continue;
      }
      if (before.receivingStatus === PackageReceivingStatus.VOIDED) {
        skipped.push({ id, trackingNo: before.trackingNo, reason: '预报已删除' });
        continue;
      }
      if (
        before.receivingStatus === PackageReceivingStatus.RECEIVED ||
        before.inboundBatchId ||
        before.inboundItemId
      ) {
        skipped.push({ id, trackingNo: before.trackingNo, reason: '已入库预报不能删除' });
        continue;
      }
      deletable.push(before);
    }

    const reason = 'Operator bulk deleted package prealerts from WMS page.';
    const deleted = await this.prisma.$transaction(async (tx) => {
      const deletedItems: ItemRecord[] = [];
      for (const before of deletable) {
        const item = (await tx.packagePrealertItem.update({
          where: { id: before.id },
          data: {
            receivingStatus: PackageReceivingStatus.VOIDED,
            voidReason: reason,
            exchangePushStatus:
              before.exchangePushStatus === PackageExchangePushStatus.PUSHED
                ? before.exchangePushStatus
                : PackageExchangePushStatus.SKIPPED,
          },
          include: itemInclude,
        })) as ItemRecord;
        await tx.packageAlert.updateMany({
          where: {
            prealertItemId: before.id,
            status: { in: [PackageAlertStatus.OPEN, PackageAlertStatus.IN_PROGRESS] },
          },
          data: {
            status: PackageAlertStatus.IGNORED,
            resolvedAt: new Date(),
            resolutionNote: reason,
          },
        });
        await tx.packageTrackingEvent.create({
          data: {
            prealertItemId: before.id,
            status: item.logisticsStatus,
            rawStatus: reason,
            eventTime: new Date(),
            source: 'MANUAL',
          },
        });
        deletedItems.push(item);
      }
      return deletedItems;
    });

    for (const item of deleted) {
      const before = beforeById.get(item.id);
      if (!before) {
        continue;
      }
      await this.auditLogsService.record({
        operatorId: operator.id,
        action: AuditAction.PACKAGE_PREALERT_CHANGE,
        resourceType: 'package-prealert-item',
        resourceId: item.id,
        beforeSnapshot: this.toItemResponse(before),
        afterSnapshot: this.toItemResponse(item),
        metadata: {
          operation: 'package_prealert_bulk_delete',
          voidReason: reason,
        },
      });
    }

    return {
      requested: uniqueIds.length,
      deleted: deleted.length,
      skipped,
      items: deleted.map((item) => this.toItemResponse(item)),
    };
  }

  async handleAlert(id: string, dto: HandlePackageAlertDto, operator: AuthenticatedUser) {
    if (dto.status === PackageAlertStatus.OPEN) {
      throw new BadRequestException(
        'Alert can only be moved to in progress, resolved, or ignored.',
      );
    }
    const before = await this.prisma.packageAlert.findUnique({
      where: { id },
      include: { prealertItem: true },
    });
    if (!before) {
      throw new NotFoundException('Package alert not found.');
    }
    const after = await this.prisma.packageAlert.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNote: dto.resolutionNote.trim(),
        resolvedAt:
          dto.status === PackageAlertStatus.RESOLVED || dto.status === PackageAlertStatus.IGNORED
            ? new Date()
            : undefined,
      },
    });

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.PACKAGE_ALERT_HANDLE,
      resourceType: 'package-alert',
      resourceId: after.id,
      beforeSnapshot: {
        status: before.status,
        resolutionNote: before.resolutionNote,
      },
      afterSnapshot: {
        status: after.status,
        resolutionNote: after.resolutionNote,
      },
    });

    return after;
  }

  async linkInboundByTracking(input: {
    trackingNo: string;
    inboundBatchId: string;
    inboundItemId: string;
    operatorId: string;
  }) {
    const trackingNo = this.normalizeTracking(input.trackingNo);
    const item = await this.prisma.packagePrealertItem.findFirst({
      where: {
        trackingNo,
        receivingStatus: { not: PackageReceivingStatus.VOIDED },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!item || item.inboundItemId) {
      return;
    }

    await this.prisma.packagePrealertItem.update({
      where: { id: item.id },
      data: {
        receivingStatus: PackageReceivingStatus.RECEIVED,
        inboundBatchId: input.inboundBatchId,
        inboundItemId: input.inboundItemId,
      },
    });
    await this.prisma.packageAlert.updateMany({
      where: {
        prealertItemId: item.id,
        status: { in: [PackageAlertStatus.OPEN, PackageAlertStatus.IN_PROGRESS] },
        alertType: {
          in: [PackageAlertType.DELIVERED_NOT_RECEIVED, PackageAlertType.ETA_OVERDUE],
        },
      },
      data: {
        status: PackageAlertStatus.RESOLVED,
        resolvedAt: new Date(),
        resolutionNote: 'Package linked to confirmed inbound batch.',
      },
    });
    await this.auditLogsService.record({
      operatorId: input.operatorId,
      action: AuditAction.PACKAGE_PREALERT_INBOUND_LINK,
      resourceType: 'package-prealert-item',
      resourceId: item.id,
      afterSnapshot: {
        inboundBatchId: input.inboundBatchId,
        inboundItemId: input.inboundItemId,
      },
    });
  }

  private async refreshOpenAlertsForItems(ids?: string[]) {
    const items = await this.prisma.packagePrealertItem.findMany({
      where: {
        id: ids ? { in: ids } : undefined,
        receivingStatus: PackageReceivingStatus.NOT_RECEIVED,
      },
      select: {
        id: true,
      },
    });
    for (const item of items) {
      await this.ensureAlerts(item.id);
    }
  }

  private async ensureAlerts(itemId: string) {
    const item = await this.prisma.packagePrealertItem.findUnique({
      where: { id: itemId },
      include: { alerts: true },
    });
    if (!item || item.receivingStatus !== PackageReceivingStatus.NOT_RECEIVED) {
      return;
    }

    if (item.logisticsStatus === PackageLogisticsStatus.DELIVERED || item.deliveredAt) {
      await this.ensureOpenAlert(
        item.id,
        PackageAlertType.DELIVERED_NOT_RECEIVED,
        PackageAlertSeverity.CRITICAL,
      );
    }
    if (
      item.estimatedArrivalAt &&
      item.estimatedArrivalAt.getTime() + 12 * 60 * 60 * 1000 < Date.now() &&
      item.logisticsStatus !== PackageLogisticsStatus.DELIVERED
    ) {
      await this.ensureOpenAlert(
        item.id,
        PackageAlertType.ETA_OVERDUE,
        PackageAlertSeverity.WARNING,
      );
    }
    if (
      item.logisticsUpdatedAt &&
      item.logisticsUpdatedAt.getTime() + 72 * 60 * 60 * 1000 < Date.now() &&
      item.logisticsStatus !== PackageLogisticsStatus.DELIVERED
    ) {
      await this.ensureOpenAlert(
        item.id,
        PackageAlertType.STALE_TRACKING,
        PackageAlertSeverity.WARNING,
      );
    }
  }

  private async ensureOpenAlert(
    prealertItemId: string,
    alertType: PackageAlertType,
    severity: PackageAlertSeverity,
  ) {
    const existing = await this.prisma.packageAlert.findFirst({
      where: {
        prealertItemId,
        alertType,
        status: { in: [PackageAlertStatus.OPEN, PackageAlertStatus.IN_PROGRESS] },
      },
    });
    if (!existing) {
      await this.prisma.packageAlert.create({
        data: { prealertItemId, alertType, severity },
      });
    }
  }

  private prepareItem(item: CreatePackagePrealertItemDto) {
    const parsed = this.parseTracking(item.trackingNo, item.trackingLink);
    return {
      ...parsed,
      estimatedArrivalAt: item.estimatedArrivalAt ? new Date(item.estimatedArrivalAt) : undefined,
      productModel: this.trimOptional(item.productModel),
      recipientName: this.trimOptional(item.recipientName),
      notes: this.trimOptional(item.notes),
    };
  }

  private parseTracking(rawTrackingNo?: string, trackingLink?: string) {
    const source = this.trimOptional(rawTrackingNo) ?? this.extractTrackingFromLink(trackingLink);
    if (!source) {
      throw new BadRequestException(
        'Package tracking number or parseable tracking link is required.',
      );
    }
    const trackingNo = this.normalizeTracking(source);
    return {
      trackingNo,
      carrier: this.detectCarrier(trackingNo, trackingLink),
      originalTrackingLink: this.trimOptional(trackingLink),
    };
  }

  private extractTrackingFromLink(link?: string) {
    const trimmed = this.trimOptional(link);
    if (!trimmed) {
      return undefined;
    }
    try {
      const url = new URL(trimmed);
      const appleOrderNo = url.pathname.match(/\/vieworder\/([A-Z0-9]+)/i)?.[1];
      if (url.hostname.includes('apple.com') && appleOrderNo) {
        return `APPLE-${appleOrderNo.toUpperCase()}`;
      }
      for (const key of ['tracknum', 'trackingNumber', 'tLabels', 'trknbr', 'tracknumbers']) {
        const value = url.searchParams.get(key);
        if (value) {
          return value.split(/[,\s]+/)[0];
        }
      }
    } catch {
      // Fall through to regex extraction for pasted text or non-standard links.
    }
    return trimmed.match(/1Z[0-9A-Z]{10,24}/i)?.[0] ?? trimmed.match(/\b\d{12,34}\b/)?.[0];
  }

  private detectCarrier(trackingNo: string, link?: string) {
    const lowerLink = link?.toLowerCase() ?? '';
    if (trackingNo.startsWith('1Z') || lowerLink.includes('ups.com')) {
      return PackageCarrier.UPS;
    }
    if (lowerLink.includes('usps.com')) {
      return PackageCarrier.USPS;
    }
    if (lowerLink.includes('fedex.com') || trackingNo.startsWith('9622')) {
      return PackageCarrier.FEDEX;
    }
    return PackageCarrier.UNKNOWN;
  }

  private normalizeTracking(value: string) {
    return normalizePackageTracking(value).replace(/\s+/g, '').toUpperCase();
  }

  private toItemWhere(query: ListPackagePrealertsQueryDto): Prisma.PackagePrealertItemWhereInput {
    return {
      customerId: this.trimOptional(query.customerId),
      logisticsStatus: query.logisticsStatus,
      receivingStatus: query.receivingStatus ?? { not: PackageReceivingStatus.VOIDED },
      OR: this.toSearchWhere(query.search),
    };
  }

  private toSearchWhere(search?: string): Prisma.PackagePrealertItemWhereInput[] | undefined {
    const trimmed = this.trimOptional(search);
    if (!trimmed) {
      return undefined;
    }
    return [
      { trackingNo: { contains: trimmed, mode: 'insensitive' } },
      { originalTrackingLink: { contains: trimmed, mode: 'insensitive' } },
      { customer: { code: { contains: trimmed, mode: 'insensitive' } } },
      { customer: { name: { contains: trimmed, mode: 'insensitive' } } },
      { batch: { batchNo: { contains: trimmed, mode: 'insensitive' } } },
    ];
  }

  private generateBatchNo() {
    const now = new Date();
    const stamp = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
      String(now.getUTCHours()).padStart(2, '0'),
      String(now.getUTCMinutes()).padStart(2, '0'),
      String(now.getUTCSeconds()).padStart(2, '0'),
    ].join('');
    return `PRE-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private trimOptional(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed || undefined;
  }

  private toBatchResponse(batch: BatchRecord) {
    return {
      id: batch.id,
      batchNo: batch.batchNo,
      status: batch.status,
      source: batch.source,
      notes: batch.notes,
      customer: this.toCustomerResponse(batch.customer),
      createdBy: batch.createdBy,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      summary: {
        total: batch.items.length,
        delivered: batch.items.filter(
          (item) => item.logisticsStatus === PackageLogisticsStatus.DELIVERED,
        ).length,
        received: batch.items.filter(
          (item) => item.receivingStatus === PackageReceivingStatus.RECEIVED,
        ).length,
      },
    };
  }

  private toItemResponse(item: ItemRecord) {
    const openAlerts = item.alerts.filter((alert) => this.isOpenAlertStatus(alert.status));
    return {
      id: item.id,
      batch: {
        id: item.batch.id,
        batchNo: item.batch.batchNo,
        status: item.batch.status,
      },
      customer: this.toCustomerResponse(item.customer),
      carrier: item.carrier,
      trackingNo: item.trackingNo,
      originalTrackingLink: item.originalTrackingLink,
      logisticsStatus: item.logisticsStatus,
      rawLogisticsStatus: item.rawLogisticsStatus,
      logisticsUpdatedAt: item.logisticsUpdatedAt,
      estimatedArrivalAt: item.estimatedArrivalAt,
      deliveredAt: item.deliveredAt,
      receivingStatus: item.receivingStatus,
      productModel: item.productModel,
      recipientName: item.recipientName,
      exchangePushStatus: item.exchangePushStatus,
      exchangeRecordId: item.exchangeRecordId,
      exchangePushedAt: item.exchangePushedAt,
      exchangePulledAt: item.exchangePulledAt,
      exchangeSyncError: item.exchangeSyncError,
      inboundBatch: item.inboundBatch
        ? { id: item.inboundBatch.id, batchNo: item.inboundBatch.batchNo }
        : null,
      notes: item.notes,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      alerts: openAlerts.map((alert) => ({
        id: alert.id,
        alertType: alert.alertType,
        severity: alert.severity,
        status: alert.status,
        triggeredAt: alert.triggeredAt,
        resolutionNote: alert.resolutionNote,
      })),
      events: item.events.map((event) => ({
        id: event.id,
        status: event.status,
        rawStatus: event.rawStatus,
        eventTime: event.eventTime,
        estimatedArrivalAt: event.estimatedArrivalAt,
        location: event.location,
        source: event.source,
        createdAt: event.createdAt,
      })),
    };
  }

  private toAlertResponse(alert: AlertRecord) {
    return {
      id: alert.id,
      alertType: alert.alertType,
      severity: alert.severity,
      status: alert.status,
      triggeredAt: alert.triggeredAt,
      resolvedAt: alert.resolvedAt,
      resolutionNote: alert.resolutionNote,
      prealert: this.toItemResponse(alert.prealertItem),
    };
  }

  private toCustomerResponse(customer: {
    id: string;
    code: string;
    name: string;
    status?: CustomerStatus;
  }) {
    return {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      status: customer.status,
    };
  }

  private isOpenAlertStatus(status: PackageAlertStatus) {
    return status === PackageAlertStatus.OPEN || status === PackageAlertStatus.IN_PROGRESS;
  }
}

type ItemRecord = Prisma.PackagePrealertItemGetPayload<{ include: typeof itemInclude }>;
type BatchRecord = Prisma.PackagePrealertBatchGetPayload<{
  include: {
    customer: true;
    createdBy: { select: { id: true; name: true; email: true } };
    items: true;
  };
}>;
type AlertRecord = Prisma.PackageAlertGetPayload<{
  include: { prealertItem: { include: typeof itemInclude } };
}>;
