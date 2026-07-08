/* global jest */
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
});
