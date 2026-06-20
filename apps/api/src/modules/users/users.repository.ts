import { Injectable } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export const userInclude = {
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
} as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(params: {
    skip: number;
    take: number;
    search?: string;
    status?: UserStatus;
    orderBy: Prisma.UserOrderByWithRelationInput;
  }) {
    const where = this.toWhere(params.search, params.status);

    return this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
        include: userInclude,
      }),
    ]);
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id }, include: userInclude });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findRolesByCodes(codes: string[]) {
    return this.prisma.role.findMany({ where: { code: { in: codes } } });
  }

  async ensureRoleWithPermissions(input: {
    code: string;
    name: string;
    description: string;
    permissions: readonly { code: string; name: string }[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.upsert({
        where: { code: input.code },
        update: {
          name: input.name,
          description: input.description,
        },
        create: {
          code: input.code,
          name: input.name,
          description: input.description,
        },
      });

      for (const definition of input.permissions) {
        const permission = await tx.permission.upsert({
          where: { code: definition.code },
          update: { name: definition.name },
          create: definition,
        });

        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permission.id,
          },
        });
      }

      return role;
    });
  }

  create(data: Prisma.UserCreateInput, roleIds: string[]) {
    return this.prisma.user.create({
      data: {
        ...data,
        roles: {
          create: roleIds.map((roleId) => ({ roleId })),
        },
      },
      include: userInclude,
    });
  }

  update(id: string, data: Prisma.UserUpdateInput, roleIds?: string[]) {
    return this.prisma.$transaction(async (tx) => {
      if (roleIds) {
        await tx.userRoleAssignment.deleteMany({ where: { userId: id } });
        await tx.userRoleAssignment.createMany({
          data: roleIds.map((roleId) => ({ userId: id, roleId })),
          skipDuplicates: true,
        });
      }

      return tx.user.update({
        where: { id },
        data,
        include: userInclude,
      });
    });
  }

  private toWhere(search?: string, status?: UserStatus): Prisma.UserWhereInput {
    return {
      status,
      OR: search
        ? [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };
  }
}
