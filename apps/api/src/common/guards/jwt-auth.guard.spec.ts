/* global jest */
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { RequestContext } from '../types/request-context';
import { JwtAuthGuard } from './jwt-auth.guard';

function createContext(request: RequestContext): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

function createGuard(payload: Record<string, unknown>) {
  const jwtService = {
    verifyAsync: jest.fn().mockResolvedValue(payload),
  } as unknown as jest.Mocked<JwtService>;
  const configService = {
    get: jest.fn().mockReturnValue('test-access-secret'),
  } as unknown as ConfigService;

  return {
    guard: new JwtAuthGuard(jwtService, configService),
    jwtService,
  };
}

describe('JwtAuthGuard', () => {
  it('restores the token session id onto the authenticated request user', async () => {
    const request = {
      headers: { authorization: 'Bearer access-token' },
    } as RequestContext;
    const { guard, jwtService } = createGuard({
      sub: 'user-1',
      sessionId: 'session-1',
      type: 'access',
      email: 'admin@wms-scan.local',
      name: 'Admin',
      roles: ['ADMIN'],
      permissions: ['settings.manage'],
    });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'user-1',
      sessionId: 'session-1',
      email: 'admin@wms-scan.local',
      name: 'Admin',
      roles: ['ADMIN'],
      permissions: ['settings.manage'],
    });
    expect(jwtService.verifyAsync).toHaveBeenCalledWith(
      'access-token',
      expect.objectContaining({ secret: 'test-access-secret' }),
    );
  });

  it('rejects legacy access tokens without a session id', async () => {
    const request = {
      headers: { authorization: 'Bearer legacy-access-token' },
    } as RequestContext;
    const { guard } = createGuard({
      sub: 'user-1',
      type: 'access',
      email: 'admin@wms-scan.local',
      name: 'Admin',
      roles: ['ADMIN'],
      permissions: ['settings.manage'],
    });

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(UnauthorizedException);
    expect(request.user).toBeUndefined();
  });
});
