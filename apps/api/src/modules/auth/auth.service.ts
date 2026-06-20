import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { BusinessError } from '../../common/errors/business-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditContext, AuditLogsService } from '../audit-logs/audit-logs.service';
import { UsersService } from '../users/users.service';
import { AuthRepository } from './auth.repository';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

type UserRecord = NonNullable<Awaited<ReturnType<AuthRepository['findById']>>>;

type TokenPayload = AuthenticatedUser & {
  sub: string;
  type: 'access' | 'refresh';
};

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly auditLogsService: AuditLogsService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async login(dto: LoginDto, context: AuditContext) {
    const user = await this.authRepository.findByEmail(dto.email.toLowerCase());

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new BusinessError(
        ErrorCode.AUTHENTICATION_FAILED,
        'Email or password is incorrect.',
        undefined,
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new BusinessError(
        ErrorCode.AUTHENTICATION_FAILED,
        'User account is disabled.',
        undefined,
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.authRepository.updateLastLoginAt(user.id);
    const authUser = this.toAuthenticatedUser(user);
    await this.auditLogsService.record({
      ...context,
      operatorId: user.id,
      action: AuditAction.LOGIN,
      resourceType: 'user',
      resourceId: user.id,
      afterSnapshot: { email: user.email },
    });

    return {
      user: this.toPublicUser(user),
      tokens: await this.issueTokens(authUser),
    };
  }

  async refresh(dto: RefreshTokenDto) {
    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(dto.refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Refresh token is required.');
      }

      const user = await this.authRepository.findById(payload.sub);
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('User account is unavailable.');
      }

      const authUser = this.toAuthenticatedUser(user);
      return {
        user: this.toPublicUser(user),
        tokens: await this.issueTokens(authUser),
      };
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }
  }

  async register(dto: RegisterDto, context: AuditContext) {
    const user = await this.usersService.registerOperator(dto, context);
    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles.map((role) => role.code),
      permissions: user.permissions,
    };

    return {
      user: {
        ...authUser,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      tokens: await this.issueTokens(authUser),
    };
  }

  async logout(user: AuthenticatedUser, context: AuditContext) {
    await this.auditLogsService.record({
      ...context,
      operatorId: user.id,
      action: AuditAction.LOGOUT,
      resourceType: 'user',
      resourceId: user.id,
      metadata: { email: user.email },
    });

    return { loggedOut: true };
  }

  async me(userId: string) {
    const user = await this.authRepository.findById(userId);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is unavailable.');
    }

    return this.toPublicUser(user);
  }

  private async issueTokens(user: AuthenticatedUser) {
    const basePayload = {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      permissions: user.permissions,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...basePayload, type: 'access' },
        {
          secret: this.configService.get<string>('jwt.accessSecret'),
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        { ...basePayload, type: 'refresh' },
        {
          secret: this.configService.get<string>('jwt.refreshSecret'),
          expiresIn: '7d',
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
    };
  }

  private toAuthenticatedUser(user: UserRecord): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles.map((assignment) => assignment.role.code),
      permissions: [
        ...new Set(
          user.roles.flatMap((assignment) =>
            assignment.role.permissions.map((rolePermission) => rolePermission.permission.code),
          ),
        ),
      ],
    };
  }

  private toPublicUser(user: UserRecord) {
    const authUser = this.toAuthenticatedUser(user);
    return {
      ...authUser,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
