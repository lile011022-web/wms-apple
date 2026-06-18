import { Injectable } from '@nestjs/common';
import { ExceptionStatus, InventoryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  countTodayInboundItems(where: Prisma.InboundItemWhereInput) {
    return this.prisma.inboundItem.count({ where });
  }

  countTodaySealedBoxes(where: Prisma.OutboundBoxWhereInput) {
    return this.prisma.outboundBox.count({ where });
  }

  countInStockItems(warehouseId?: string) {
    return this.prisma.inventoryItem.count({
      where: {
        status: InventoryStatus.IN_STOCK,
        warehouseId,
      },
    });
  }

  countPendingExceptions(warehouseId?: string) {
    return this.prisma.exceptionRecord.count({
      where: {
        status: ExceptionStatus.OPEN,
        warehouseId,
      },
    });
  }

  groupInboundByDay(where: Prisma.InboundItemWhereInput) {
    return this.prisma.inboundItem.groupBy({
      by: ['scannedAt'],
      where,
      _count: { _all: true },
      orderBy: { scannedAt: 'asc' },
    });
  }

  groupOutboundByDay(where: Prisma.OutboundBoxWhereInput) {
    return this.prisma.outboundBox.groupBy({
      by: ['sealedAt'],
      where,
      _count: { _all: true },
      orderBy: { sealedAt: 'asc' },
    });
  }

  groupOpenExceptionsByType(warehouseId?: string) {
    return this.prisma.exceptionRecord.groupBy({
      by: ['type'],
      where: {
        status: ExceptionStatus.OPEN,
        warehouseId,
      },
      _count: { _all: true },
      orderBy: { type: 'asc' },
    });
  }

  groupTodayInboundByCustomer(where: Prisma.InboundItemWhereInput) {
    return this.prisma.inboundItem.groupBy({
      by: ['customerId'],
      where,
      _count: { _all: true },
      orderBy: {
        _count: {
          customerId: 'desc',
        },
      },
      take: 5,
    });
  }

  findCustomersByIds(ids: string[]) {
    return this.prisma.customer.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
  }
}
