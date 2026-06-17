import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RolesRepository } from './roles.repository';

type RoleRecord = Awaited<ReturnType<RolesRepository['findMany']>>[number];

@Injectable()
export class RolesService {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async list() {
    const roles = await this.rolesRepository.findMany();
    return roles.map((role) => this.toRoleResponse(role));
  }

  async updatePermissions(id: string, dto: UpdateRolePermissionsDto, operator: AuthenticatedUser) {
    const before = await this.rolesRepository.findById(id);
    if (!before) {
      throw new NotFoundException('Role not found.');
    }

    const normalizedCodes = [...new Set(dto.permissionCodes.map((code) => code.trim()))].sort();
    const permissions = await this.rolesRepository.findPermissionsByCodes(normalizedCodes);
    const foundCodes = new Set(permissions.map((permission) => permission.code));
    const missingCodes = normalizedCodes.filter((code) => !foundCodes.has(code));

    if (missingCodes.length > 0) {
      throw new NotFoundException(`Permission not found: ${missingCodes.join(', ')}`);
    }

    const after = await this.rolesRepository.updatePermissions(
      id,
      permissions.map((permission) => permission.id),
    );

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.ROLE_CHANGE,
      resourceType: 'role',
      resourceId: after.id,
      beforeSnapshot: this.toAuditSnapshot(before),
      afterSnapshot: this.toAuditSnapshot(after),
    });

    return this.toRoleResponse(after);
  }

  private toRoleResponse(role: RoleRecord) {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      userCount: role._count.users,
      permissions: role.permissions
        .map((rolePermission) => ({
          id: rolePermission.permission.id,
          code: rolePermission.permission.code,
          name: rolePermission.permission.name,
          description: rolePermission.permission.description,
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  private toAuditSnapshot(role: RoleRecord) {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      permissionCodes: role.permissions
        .map((rolePermission) => rolePermission.permission.code)
        .sort(),
    };
  }
}
