import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedUser } from '../types/authenticated-user';
import type { RequestContext } from '../types/request-context';

type AccessTokenPayload = AuthenticatedUser & {
  sub: string;
  type: 'access';
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestContext>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token is required.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });

      if (payload.type !== 'access') {
        throw new UnauthorizedException('Access token is required.');
      }

      if (typeof payload.sessionId !== 'string' || payload.sessionId.trim().length === 0) {
        throw new UnauthorizedException('Access token session is required.');
      }

      request.user = {
        id: payload.sub,
        sessionId: payload.sessionId,
        email: payload.email,
        name: payload.name,
        roles: payload.roles,
        permissions: payload.permissions,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Authentication token is invalid or expired.');
    }
  }

  private extractBearerToken(request: RequestContext): string | undefined {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return undefined;
    }

    const [scheme, token] = authorization.split(' ');
    return scheme === 'Bearer' ? token : undefined;
  }
}
