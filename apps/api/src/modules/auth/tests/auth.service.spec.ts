/* global jest */
import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { BusinessError } from '../../../common/errors/business-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AuthRepository } from '../auth.repository';
import { AuthService } from '../auth.service';

const activeUser = {
  id: 'user-1',
  email: 'admin@wms-scan.local',
  name: 'Admin',
  passwordHash: '',
  status: UserStatus.ACTIVE as UserStatus,
  lastLoginAt: null,
  createdAt: new Date('2026-06-17T00:00:00Z'),
  updatedAt: new Date('2026-06-17T00:00:00Z'),
  roles: [
    {
      role: {
        code: 'ADMIN',
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

function createService(user = activeUser) {
  const authRepository = {
    findByEmail: jest.fn().mockResolvedValue(user),
    findById: jest.fn().mockResolvedValue(user),
    updateLastLoginAt: jest.fn(),
  } as unknown as jest.Mocked<AuthRepository>;
  const auditLogsService = {
    record: jest.fn(),
  } as unknown as jest.Mocked<AuditLogsService>;
  const configService = {
    get: jest.fn().mockReturnValue('test-secret-at-least-sixteen'),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token'),
    verifyAsync: jest.fn(),
  } as unknown as jest.Mocked<JwtService>;

  return {
    service: new AuthService(authRepository, auditLogsService, configService as never, jwtService),
    authRepository,
    auditLogsService,
    jwtService,
  };
}

describe('AuthService', () => {
  it('logs in active users, omits password hash, and writes audit log', async () => {
    const passwordHash = await bcrypt.hash('local-password', 4);
    const { service, auditLogsService } = createService({ ...activeUser, passwordHash });

    await expect(
      service.login(
        {
          email: 'ADMIN@wms-scan.local',
          password: 'local-password',
        },
        { requestId: 'req-1' },
      ),
    ).resolves.toMatchObject({
      user: {
        id: 'user-1',
        email: 'admin@wms-scan.local',
        permissions: ['settings.manage'],
      },
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
      },
    });
    await expect(
      service.login(
        {
          email: 'admin@wms-scan.local',
          password: 'local-password',
        },
        { requestId: 'req-1' },
      ),
    ).resolves.not.toHaveProperty('user.passwordHash');
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.LOGIN,
        operatorId: 'user-1',
      }),
    );
  });

  it('rejects disabled users', async () => {
    const passwordHash = await bcrypt.hash('local-password', 4);
    const { service } = createService({
      ...activeUser,
      passwordHash,
      status: UserStatus.DISABLED,
    });

    await expect(
      service.login({ email: 'admin@wms-scan.local', password: 'local-password' }, {}),
    ).rejects.toMatchObject<Partial<BusinessError>>({
      code: ErrorCode.AUTHENTICATION_FAILED,
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it('rejects unavailable users during refresh', async () => {
    const { service, authRepository, jwtService } = createService(null as never);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      type: 'refresh',
    } as never);
    authRepository.findById.mockResolvedValue(null);

    await expect(service.refresh({ refreshToken: 'refresh-token-value-for-test' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('writes logout audit logs', async () => {
    const { service, auditLogsService } = createService();

    await expect(
      service.logout(
        {
          id: 'user-1',
          email: 'admin@wms-scan.local',
          name: 'Admin',
          roles: ['ADMIN'],
          permissions: ['settings.manage'],
        },
        { requestId: 'req-logout' },
      ),
    ).resolves.toEqual({ loggedOut: true });
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.LOGOUT,
        operatorId: 'user-1',
      }),
    );
  });
});
