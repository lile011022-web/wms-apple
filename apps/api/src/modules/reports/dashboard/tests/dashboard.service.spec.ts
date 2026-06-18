/* global afterEach, beforeEach, jest */
import { ExceptionType } from '@prisma/client';
import { DashboardRepository } from '../dashboard.repository';
import { DashboardService } from '../dashboard.service';

function createService(
  repositoryOverrides: Partial<Record<keyof DashboardRepository, jest.Mock>> = {},
) {
  const repository = {
    countTodayInboundItems: jest.fn().mockResolvedValue(3),
    countTodaySealedBoxes: jest.fn().mockResolvedValue(2),
    countInStockItems: jest.fn().mockResolvedValue(9),
    countPendingExceptions: jest.fn().mockResolvedValue(1),
    groupInboundByDay: jest.fn().mockResolvedValue([
      {
        scannedAt: new Date('2026-06-12T01:00:00.000Z'),
        _count: { _all: 4 },
      },
      {
        scannedAt: new Date('2026-06-18T08:00:00.000Z'),
        _count: { _all: 3 },
      },
    ]),
    groupOutboundByDay: jest.fn().mockResolvedValue([
      {
        sealedAt: new Date('2026-06-18T09:00:00.000Z'),
        _count: { _all: 2 },
      },
    ]),
    groupOpenExceptionsByType: jest.fn().mockResolvedValue([
      {
        type: ExceptionType.IMEI_DUPLICATED,
        _count: { _all: 2 },
      },
    ]),
    groupTodayInboundByCustomer: jest.fn().mockResolvedValue([
      {
        customerId: 'customer-1',
        _count: { _all: 5 },
      },
    ]),
    findCustomersByIds: jest.fn().mockResolvedValue([
      {
        id: 'customer-1',
        code: 'CUST-001',
        name: 'Apple Demo Customer',
      },
    ]),
    ...repositoryOverrides,
  } as unknown as jest.Mocked<DashboardRepository>;

  return {
    repository,
    service: new DashboardService(repository),
  };
}

describe('DashboardService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-18T10:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns phase-fourteen summary metrics from real repository counts', async () => {
    const { repository, service } = createService();

    await expect(service.getSummary({ warehouseId: 'warehouse-1' })).resolves.toMatchObject({
      todayInboundCount: 3,
      todayOutboundBoxCount: 2,
      inStockTotal: 9,
      pendingExceptionCount: 1,
    });
    expect(repository.countTodayInboundItems).toHaveBeenCalledWith({
      status: 'CONFIRMED',
      scannedAt: {
        gte: new Date('2026-06-18T00:00:00.000Z'),
        lt: new Date('2026-06-19T00:00:00.000Z'),
      },
      inboundBatch: {
        warehouseId: 'warehouse-1',
      },
    });
    expect(repository.countInStockItems).toHaveBeenCalledWith('warehouse-1');
  });

  it('fills a seven-day inbound and outbound trend series', async () => {
    const { service } = createService();

    await expect(service.getTrends({})).resolves.toMatchObject({
      days: [
        { date: '2026-06-12', inboundCount: 4, outboundBoxCount: 0 },
        { date: '2026-06-13', inboundCount: 0, outboundBoxCount: 0 },
        { date: '2026-06-14', inboundCount: 0, outboundBoxCount: 0 },
        { date: '2026-06-15', inboundCount: 0, outboundBoxCount: 0 },
        { date: '2026-06-16', inboundCount: 0, outboundBoxCount: 0 },
        { date: '2026-06-17', inboundCount: 0, outboundBoxCount: 0 },
        { date: '2026-06-18', inboundCount: 3, outboundBoxCount: 2 },
      ],
    });
  });

  it('returns open exception distribution and today top inbound customers', async () => {
    const { service } = createService();

    await expect(service.getExceptionDistribution({})).resolves.toMatchObject({
      items: [{ type: ExceptionType.IMEI_DUPLICATED, count: 2 }],
    });
    await expect(service.getTopInboundCustomers({})).resolves.toMatchObject({
      items: [
        {
          customerId: 'customer-1',
          customerCode: 'CUST-001',
          customerName: 'Apple Demo Customer',
          inboundCount: 5,
        },
      ],
    });
  });
});
