import { Injectable } from '@nestjs/common';
import { InboundItemStatus, OutboundBoxStatus } from '@prisma/client';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardRepository } from './dashboard.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  async getSummary(query: DashboardQueryDto) {
    const { todayStart, tomorrowStart } = this.getTodayRange();

    const [todayInboundCount, todayOutboundBoxCount, inStockTotal, pendingExceptionCount] =
      await Promise.all([
        this.dashboardRepository.countTodayInboundItems(
          this.buildInboundWhere(todayStart, tomorrowStart, query.warehouseId),
        ),
        this.dashboardRepository.countTodaySealedBoxes(
          this.buildOutboundWhere(todayStart, tomorrowStart, query.warehouseId),
        ),
        this.dashboardRepository.countInStockItems(query.warehouseId),
        this.dashboardRepository.countPendingExceptions(query.warehouseId),
      ]);

    return {
      todayInboundCount,
      todayOutboundBoxCount,
      inStockTotal,
      pendingExceptionCount,
      generatedAt: new Date(),
    };
  }

  async getTrends(query: DashboardQueryDto) {
    const { todayStart, tomorrowStart } = this.getTodayRange();
    const trendStart = new Date(todayStart.getTime() - 6 * DAY_MS);
    const [inboundRows, outboundRows] = await Promise.all([
      this.dashboardRepository.groupInboundByDay(
        this.buildInboundWhere(trendStart, tomorrowStart, query.warehouseId),
      ),
      this.dashboardRepository.groupOutboundByDay(
        this.buildOutboundWhere(trendStart, tomorrowStart, query.warehouseId),
      ),
    ]);
    const inboundByDate = this.sumByDate(inboundRows, 'scannedAt');
    const outboundByDate = this.sumByDate(outboundRows, 'sealedAt');

    return {
      days: Array.from({ length: 7 }, (_, index) => {
        const date = new Date(trendStart.getTime() + index * DAY_MS);
        const dateKey = this.toDateKey(date);

        return {
          date: dateKey,
          inboundCount: inboundByDate.get(dateKey) ?? 0,
          outboundBoxCount: outboundByDate.get(dateKey) ?? 0,
        };
      }),
      generatedAt: new Date(),
    };
  }

  async getExceptionDistribution(query: DashboardQueryDto) {
    const rows = await this.dashboardRepository.groupOpenExceptionsByType(query.warehouseId);

    return {
      items: rows.map((row) => ({
        type: row.type,
        count: row._count._all,
      })),
      generatedAt: new Date(),
    };
  }

  async getTopInboundCustomers(query: DashboardQueryDto) {
    const { todayStart, tomorrowStart } = this.getTodayRange();
    const rows = await this.dashboardRepository.groupTodayInboundByCustomer(
      this.buildInboundWhere(todayStart, tomorrowStart, query.warehouseId),
    );
    const customers = await this.dashboardRepository.findCustomersByIds(
      rows.map((row) => row.customerId),
    );
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));

    return {
      items: rows.map((row) => {
        const customer = customerById.get(row.customerId);

        return {
          customerId: row.customerId,
          customerCode: customer?.code ?? null,
          customerName: customer?.name ?? null,
          inboundCount: row._count._all,
        };
      }),
      generatedAt: new Date(),
    };
  }

  private buildInboundWhere(start: Date, end: Date, warehouseId?: string) {
    return {
      status: InboundItemStatus.CONFIRMED,
      scannedAt: {
        gte: start,
        lt: end,
      },
      inboundBatch: {
        warehouseId,
      },
    };
  }

  private buildOutboundWhere(start: Date, end: Date, warehouseId?: string) {
    return {
      status: OutboundBoxStatus.SEALED,
      sealedAt: {
        gte: start,
        lt: end,
      },
      warehouseId,
    };
  }

  private getTodayRange() {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);

    return { todayStart, tomorrowStart };
  }

  private sumByDate<T extends { _count: { _all: number } }>(
    rows: T[],
    field: keyof T,
  ): Map<string, number> {
    return rows.reduce((acc, row) => {
      const raw = row[field];
      if (!(raw instanceof Date)) {
        return acc;
      }
      const dateKey = this.toDateKey(raw);
      acc.set(dateKey, (acc.get(dateKey) ?? 0) + row._count._all);
      return acc;
    }, new Map<string, number>());
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
