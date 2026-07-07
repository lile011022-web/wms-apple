import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const userWithRolesAndPermissions = {
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
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: userWithRolesAndPermissions,
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: userWithRolesAndPermissions,
    });
  }

  updateLastLoginAt(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  updatePasswordHash(id: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash },
      include: userWithRolesAndPermissions,
    });
  }
}
