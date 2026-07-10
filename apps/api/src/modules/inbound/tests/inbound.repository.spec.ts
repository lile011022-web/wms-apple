/* global jest */
import { InboundBatchStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { InboundRepository } from '../inbound.repository';

function createRepository() {
  const prisma = {
    inboundItem: {
      count: jest.fn().mockResolvedValue(0),
    },
  };

  return {
    prisma,
    repository: new InboundRepository(prisma as unknown as PrismaService),
  };
}

describe('InboundRepository', () => {
  it('matches inbound record search by the last six IMEI or Serial characters', async () => {
    const { prisma, repository } = createRepository();

    await repository.countRecords({ search: '123456' });

    expect(prisma.inboundItem.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { imei: { endsWith: '123456' } },
          { serial: { endsWith: '123456', mode: 'insensitive' } },
        ]),
      }),
    });
  });

  it('rejects confirmation after the locked draft has been cleared by a concurrent request', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: 'draft-1',
          operatorId: 'user-1',
          creatorSessionId: 'session-1',
          status: InboundBatchStatus.DRAFT,
        },
      ]),
      inboundBatch: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'draft-1',
          inboundItems: [],
        }),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new InboundRepository(prisma as unknown as PrismaService);

    await expect(
      repository.confirmDraft({
        draftId: 'draft-1',
        operatorId: 'user-1',
        sessionId: 'session-1',
        duplicateImeiExceptionEnabled: true,
        duplicateUpsExceptionEnabled: true,
      }),
    ).rejects.toThrow('Inbound draft has no confirmable items.');
    expect(tx.inboundBatch.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
