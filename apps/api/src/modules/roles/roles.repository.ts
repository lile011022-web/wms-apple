import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export const roleInclude = {
  permissions: {
    include: {
      permission: true,
    },
  },
  _count: {
    select: {
      users: true,
    },
  },
} as const;

@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      include: roleInclude,
    });
  }

  findById(id: string) {
    return this.prisma.role.findUnique({
      where: { id },
      include: roleInclude,
    });
  }

  findPermissionsByCodes(codes: string[]) {
    return this.prisma.permission.findMany({ where: { code: { in: codes } } });
  }

  updatePermissions(roleId: string, permissionIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      });

      return tx.role.findUniqueOrThrow({
        where: { id: roleId },
        include: roleInclude,
      });
    });
  }
}
