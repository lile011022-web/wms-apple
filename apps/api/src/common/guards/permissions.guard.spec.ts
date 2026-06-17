/* global jest */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

function createContext(permissions: string[]): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          permissions,
        },
      }),
    }),
  } as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('allows users with every required permission', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['settings.manage']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(createContext(['settings.manage']))).toBe(true);
  });

  it('rejects users without required permissions', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['settings.manage']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() => guard.canActivate(createContext(['inventory.read']))).toThrow(ForbiddenException);
  });
});
