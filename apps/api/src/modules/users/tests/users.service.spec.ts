/* global jest */
import { UserStatus } from '@prisma/client';
import { UsersRepository } from '../users.repository';
import { UsersService } from '../users.service';

const user = {
  id: 'user-1',
  email: 'operator@wms-scan.local',
  name: 'Operator',
  passwordHash: 'hidden',
  status: UserStatus.ACTIVE,
  lastLoginAt: null,
  createdAt: new Date('2026-06-17T00:00:00Z'),
  updatedAt: new Date('2026-06-17T00:00:00Z'),
  roles: [
    {
      role: {
        id: 'role-1',
        code: 'ADMIN',
        name: 'Administrator',
        permissions: [
          {
            permission: {
              code: 'settings.manage',
            },
          },
        ],
      },
    },
  ],
};

describe('UsersService', () => {
  it('does not expose password hashes in list responses', async () => {
    const usersRepository = {
      findMany: jest.fn().mockResolvedValue([1, [user]]),
    } as unknown as jest.Mocked<UsersRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new UsersService(usersRepository, auditLogsService as never);

    await expect(
      service.list({
        page: 1,
        pageSize: 20,
        sortOrder: 'desc',
      }),
    ).resolves.toEqual({
      items: [
        expect.not.objectContaining({
          passwordHash: expect.anything(),
        }),
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });
});
