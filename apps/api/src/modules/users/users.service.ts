import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersRepository } from './users.repository';

type UserRecord = NonNullable<Awaited<ReturnType<UsersRepository['findById']>>>;

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async list(query: ListUsersQueryDto) {
    const allowedSortFields = new Set(['createdAt', 'updatedAt', 'email', 'name', 'lastLoginAt']);
    const sortBy = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'createdAt';
    const [total, users] = await this.usersRepository.findMany({
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      search: query.search,
      status: query.status,
      orderBy: { [sortBy]: query.sortOrder } as Prisma.UserOrderByWithRelationInput,
    });

    return {
      items: users.map((user) => this.toPublicUser(user)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async create(dto: CreateUserDto, operator: AuthenticatedUser) {
    const email = dto.email.toLowerCase();
    const existingUser = await this.usersRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User email already exists.');
    }

    const roleIds = await this.resolveRoleIds(dto.roleCodes ?? []);
    const user = await this.usersRepository.create(
      {
        email,
        name: dto.name,
        passwordHash: await bcrypt.hash(dto.password, 12),
        status: dto.status,
      },
      roleIds,
    );

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.USER_CHANGE,
      resourceType: 'user',
      resourceId: user.id,
      afterSnapshot: this.toAuditSnapshot(user),
    });

    return this.toPublicUser(user);
  }

  async update(id: string, dto: UpdateUserDto, operator: AuthenticatedUser) {
    const before = await this.usersRepository.findById(id);
    if (!before) {
      throw new NotFoundException('User not found.');
    }

    if (dto.email && dto.email.toLowerCase() !== before.email) {
      const existingUser = await this.usersRepository.findByEmail(dto.email.toLowerCase());
      if (existingUser) {
        throw new ConflictException('User email already exists.');
      }
    }

    const roleIds = dto.roleCodes ? await this.resolveRoleIds(dto.roleCodes) : undefined;
    const updateData: Prisma.UserUpdateInput = {
      email: dto.email?.toLowerCase(),
      name: dto.name,
      status: dto.status,
      passwordHash: dto.password ? await bcrypt.hash(dto.password, 12) : undefined,
    };
    const after = await this.usersRepository.update(id, updateData, roleIds);

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.USER_CHANGE,
      resourceType: 'user',
      resourceId: after.id,
      beforeSnapshot: this.toAuditSnapshot(before),
      afterSnapshot: this.toAuditSnapshot(after),
    });

    return this.toPublicUser(after);
  }

  private async resolveRoleIds(roleCodes: string[]) {
    if (roleCodes.length === 0) {
      return [];
    }

    const normalizedCodes = [...new Set(roleCodes.map((code) => code.trim().toUpperCase()))];
    const roles = await this.usersRepository.findRolesByCodes(normalizedCodes);
    const foundCodes = new Set(roles.map((role) => role.code));
    const missingCodes = normalizedCodes.filter((code) => !foundCodes.has(code));

    if (missingCodes.length > 0) {
      throw new NotFoundException(`Role not found: ${missingCodes.join(', ')}`);
    }

    return roles.map((role) => role.id);
  }

  private toPublicUser(user: UserRecord) {
    const roles = user.roles.map((assignment) => ({
      id: assignment.role.id,
      code: assignment.role.code,
      name: assignment.role.name,
    }));
    const permissions = [
      ...new Set(
        user.roles.flatMap((assignment) =>
          assignment.role.permissions.map((rolePermission) => rolePermission.permission.code),
        ),
      ),
    ];

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      roles,
      permissions,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toAuditSnapshot(user: UserRecord) {
    const publicUser = this.toPublicUser(user);
    return {
      id: publicUser.id,
      email: publicUser.email,
      name: publicUser.name,
      status: publicUser.status,
      roleCodes: publicUser.roles.map((role) => role.code),
    };
  }
}
