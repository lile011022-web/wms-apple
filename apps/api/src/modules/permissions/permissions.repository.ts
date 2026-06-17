import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PermissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }
}
