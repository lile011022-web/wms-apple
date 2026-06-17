import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WarehousesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(params: { search?: string; isActive?: boolean }) {
    return this.prisma.warehouse.findMany({
      where: this.toWhere(params.search, params.isActive),
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
  }

  findById(id: string) {
    return this.prisma.warehouse.findUnique({ where: { id } });
  }

  findByCode(code: string) {
    return this.prisma.warehouse.findUnique({ where: { code } });
  }

  create(data: Prisma.WarehouseCreateInput) {
    return this.prisma.warehouse.create({ data });
  }

  update(id: string, data: Prisma.WarehouseUpdateInput) {
    return this.prisma.warehouse.update({ where: { id }, data });
  }

  private toWhere(search?: string, isActive?: boolean): Prisma.WarehouseWhereInput {
    return {
      isActive,
      OR: search
        ? [
            { code: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { address: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };
  }
}
