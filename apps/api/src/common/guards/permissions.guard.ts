import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { RequestContext } from '../types/request-context';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    const userPermissions = new Set(request.user?.permissions ?? []);
    const hasEveryPermission = requiredPermissions.every((permission) => userPermissions.has(permission));

    if (!hasEveryPermission) {
      throw new ForbiddenException('Permission denied.');
    }

    return true;
  }
}
