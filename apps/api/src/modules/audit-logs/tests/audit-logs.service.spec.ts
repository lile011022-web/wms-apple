/* global jest */
import { AuditAction } from '@prisma/client';
import { AuditLogsService } from '../audit-logs.service';

const createdAt = new Date('2026-06-18T03:00:00.000Z');
const auditLog = {
  id: 'audit-1',
  action: AuditAction.INBOUND_CONFIRM,
  resourceType: 'inbound_batch',
  resourceId: 'batch-1',
  operatorId: 'user-1',
  requestId: 'req-1',
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
  beforeSnapshot: null,
  afterSnapshot: { status: 'CONFIRMED' },
  metadata: { confirmedItemCount: 2 },
  createdAt,
  operator: {
    id: 'user-1',
    email: 'operator@wms-scan.local',
    name: 'Operator',
  },
};

function createService() {
  const prisma = {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([auditLog]),
      count: jest.fn().mockResolvedValue(1),
    },
    $transaction: jest.fn((promises) => Promise.all(promises)),
  };

  return {
    prisma,
    service: new AuditLogsService(prisma as never),
  };
}

describe('AuditLogsService', () => {
  it('records auditable fields without dropping request context', async () => {
    const { prisma, service } = createService();
    prisma.auditLog.create.mockResolvedValue(auditLog);

    await service.record({
      action: AuditAction.INBOUND_CONFIRM,
      resourceType: 'inbound_batch',
      resourceId: 'batch-1',
      operatorId: 'user-1',
      requestId: 'req-1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      afterSnapshot: { status: 'CONFIRMED' },
      metadata: { confirmedItemCount: 2 },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: AuditAction.INBOUND_CONFIRM,
        resourceType: 'inbound_batch',
        resourceId: 'batch-1',
        operatorId: 'user-1',
        requestId: 'req-1',
        afterSnapshot: { status: 'CONFIRMED' },
        metadata: { confirmedItemCount: 2 },
      }),
    });
  });

  it('returns recent logs with actor, target, snapshots, request id, and created time', async () => {
    const { service } = createService();

    await expect(service.recent()).resolves.toMatchObject({
      items: [
        {
          id: 'audit-1',
          action: AuditAction.INBOUND_CONFIRM,
          resourceType: 'inbound_batch',
          resourceId: 'batch-1',
          operator: {
            id: 'user-1',
            email: 'operator@wms-scan.local',
            name: 'Operator',
          },
          requestId: 'req-1',
          beforeSnapshot: null,
          afterSnapshot: { status: 'CONFIRMED' },
          createdAt,
        },
      ],
    });
  });

  it('lists logs with filters and pagination', async () => {
    const { prisma, service } = createService();

    await expect(
      service.list({
        page: 2,
        pageSize: 10,
        sortOrder: 'desc',
        action: AuditAction.INBOUND_CONFIRM,
        resourceType: 'inbound_batch',
        operatorId: 'user-1',
        requestId: 'req-1',
        dateFrom: '2026-06-18T00:00:00.000Z',
        dateTo: '2026-06-18T23:59:59.999Z',
      }),
    ).resolves.toMatchObject({
      total: 1,
      page: 2,
      pageSize: 10,
      items: [{ id: 'audit-1' }],
    });
    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        action: AuditAction.INBOUND_CONFIRM,
        resourceType: 'inbound_batch',
        operatorId: 'user-1',
        requestId: 'req-1',
        createdAt: {
          gte: new Date('2026-06-18T00:00:00.000Z'),
          lte: new Date('2026-06-18T23:59:59.999Z'),
        },
      }),
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
});
