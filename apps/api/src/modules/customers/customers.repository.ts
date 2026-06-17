import { Injectable } from '@nestjs/common';
import { CustomerStatus, InventoryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(params: {
    skip: number;
    take: number;
    search?: string;
    status?: CustomerStatus;
    orderBy: Prisma.CustomerOrderByWithRelationInput;
  }) {
    const where = this.toWhere(params.search, params.status);

    return this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
      }),
    ]);
  }

  findOptions(params: { search?: string; includeInactive?: boolean }) {
    return this.prisma.customer.findMany({
      where: this.toWhere(params.search, params.includeInactive ? undefined : CustomerStatus.ACTIVE),
      take: 50,
      orderBy: [{ status: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
      },
    });
  }

  findById(id: string) {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  findByCode(code: string) {
    return this.prisma.customer.findUnique({ where: { code } });
  }

  create(data: Prisma.CustomerCreateInput) {
    return this.prisma.customer.create({ data });
  }

  update(id: string, data: Prisma.CustomerUpdateInput) {
    return this.prisma.customer.update({ where: { id }, data });
  }

  async getSummary(customerId: string, monthStart: Date) {
    const [inStockImeiCount, skuRows, monthlyInboundCount, monthlyOutboundCount] =
      await this.prisma.$transaction([
        this.prisma.inventoryItem.count({
          where: {
            customerId,
            status: InventoryStatus.IN_STOCK,
            imei: { not: null },
          },
        }),
        this.prisma.inventoryItem.findMany({
          where: {
            customerId,
            status: InventoryStatus.IN_STOCK,
          },
          distinct: ['productId'],
          select: {
            productId: true,
          },
        }),
        this.prisma.inboundItem.count({
          where: {
            customerId,
            status: 'CONFIRMED',
            scannedAt: {
              gte: monthStart,
            },
          },
        }),
        this.prisma.outboundBoxItem.count({
          where: {
            packedAt: {
              gte: monthStart,
            },
            outboundBox: {
              customerId,
            },
          },
        }),
      ]);

    return {
      inStockImeiCount,
      skuCount: skuRows.length,
      monthlyInboundCount,
      monthlyOutboundCount,
    };
  }

  private toWhere(search?: string, status?: CustomerStatus): Prisma.CustomerWhereInput {
    return {
      status,
      OR: search
        ? [
            { code: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { contactName: { contains: search, mode: 'insensitive' } },
            { contactInfo: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };
  }
}
