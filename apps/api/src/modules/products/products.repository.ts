import { Injectable } from '@nestjs/common';
import { ProductStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const productInclude = {
  upcs: {
    orderBy: { upc: 'asc' as const },
  },
};

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(params: {
    skip: number;
    take: number;
    search?: string;
    status?: ProductStatus;
    category?: string;
    orderBy: Prisma.ProductOrderByWithRelationInput;
  }) {
    const where = this.toWhere(params.search, params.status, params.category);

    return this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
        include: productInclude,
      }),
    ]);
  }

  findById(id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
  }

  findManyByIds(ids: string[]) {
    return this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: {
        ...productInclude,
        _count: {
          select: {
            inboundItems: true,
            inventoryItems: true,
            exceptions: true,
          },
        },
      },
    });
  }

  findBySku(sku: string) {
    return this.prisma.product.findUnique({
      where: { sku },
      include: productInclude,
    });
  }

  findManyBySkus(skus: string[]) {
    return this.prisma.product.findMany({
      where: { sku: { in: skus } },
      include: productInclude,
    });
  }

  findByUpc(upc: string) {
    return this.prisma.productUpc.findUnique({
      where: { upc },
      include: { product: { include: productInclude } },
    });
  }

  findExistingUpcs(upcs: string[]) {
    return this.prisma.productUpc.findMany({
      where: { upc: { in: upcs } },
      select: { upc: true, productId: true },
    });
  }

  create(data: Prisma.ProductCreateInput) {
    return this.prisma.product.create({
      data,
      include: productInclude,
    });
  }

  update(id: string, data: Prisma.ProductUpdateInput) {
    return this.prisma.product.update({
      where: { id },
      data,
      include: productInclude,
    });
  }

  importProducts(
    products: Array<{
      existingProductId?: string;
      createData: Prisma.ProductCreateInput;
      updateData?: Prisma.ProductUpdateInput;
    }>,
  ) {
    return this.prisma.$transaction(
      products.map((product) =>
        product.existingProductId && product.updateData
          ? this.prisma.product.update({
              where: { id: product.existingProductId },
              data: product.updateData,
              include: productInclude,
            })
          : this.prisma.product.create({
              data: product.createData,
              include: productInclude,
            }),
      ),
    );
  }

  deleteMany(ids: string[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.productUpc.deleteMany({ where: { productId: { in: ids } } });
      return tx.product.deleteMany({ where: { id: { in: ids } } });
    });
  }

  private toWhere(
    search?: string,
    status?: ProductStatus,
    category?: string,
  ): Prisma.ProductWhereInput {
    return {
      status,
      category: category ? { equals: category, mode: 'insensitive' } : undefined,
      OR: search
        ? [
            { sku: { contains: search, mode: 'insensitive' } },
            { brand: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { model: { contains: search, mode: 'insensitive' } },
            { modelCode: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } },
            { color: { contains: search, mode: 'insensitive' } },
            { capacity: { contains: search, mode: 'insensitive' } },
            { upcs: { some: { upc: { contains: search } } } },
          ]
        : undefined,
    };
  }
}
