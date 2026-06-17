import { Injectable } from '@nestjs/common';
import { AuditAction, ExceptionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const exceptionInclude = {
  customer: true,
  warehouse: true,
  product: {
    include: {
      upcs: {
        orderBy: { upc: 'asc' as const },
      },
    },
  },
  inboundItem: {
    include: {
      inboundBatch: {
        select: {
          id: true,
          batchNo: true,
          confirmedAt: true,
          operator: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      },
    },
  },
  inventoryItem: {
    include: {
      outboundBoxItems: {
        include: {
          outboundBox: {
            select: {
              id: true,
              boxNo: true,
              status: true,
              sealedAt: true,
            },
          },
        },
        orderBy: { packedAt: 'desc' as const },
      },
    },
  },
};

export type ExceptionRecordWithRelations = NonNullable<
  Awaited<ReturnType<ExceptionsRepository['findById']>>
>;

@Injectable()
export class ExceptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(params: {
    where: Prisma.ExceptionRecordWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.ExceptionRecordOrderByWithRelationInput;
  }) {
    return this.prisma.$transaction([
      this.prisma.exceptionRecord.count({ where: params.where }),
      this.prisma.exceptionRecord.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
        include: exceptionInclude,
      }),
    ]);
  }

  getSummary(where: Prisma.ExceptionRecordWhereInput = {}) {
    return this.prisma.exceptionRecord.groupBy({
      by: ['status', 'type'],
      where,
      _count: { _all: true },
      orderBy: [{ status: 'asc' }, { type: 'asc' }],
    });
  }

  findById(id: string) {
    return this.prisma.exceptionRecord.findUnique({
      where: { id },
      include: exceptionInclude,
    });
  }

  async transition(input: {
    id: string;
    status: ExceptionStatus;
    resolutionNote: string;
    operatorId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.exceptionRecord.findUniqueOrThrow({
        where: { id: input.id },
        include: exceptionInclude,
      });
      const resolvedAt = new Date();
      const updated = await tx.exceptionRecord.update({
        where: { id: input.id },
        data: {
          status: input.status,
          resolutionNote: input.resolutionNote,
          resolvedById: input.operatorId,
          resolvedAt,
          afterSnapshot: {
            status: input.status,
            resolutionNote: input.resolutionNote,
            resolvedById: input.operatorId,
            resolvedAt: resolvedAt.toISOString(),
          },
        },
        include: exceptionInclude,
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.EXCEPTION_HANDLE,
          resourceType: 'exception',
          resourceId: input.id,
          operatorId: input.operatorId,
          beforeSnapshot: this.toAuditSnapshot(before),
          afterSnapshot: this.toAuditSnapshot(updated),
          metadata: {
            transitionTo: input.status,
          },
        },
      });

      return updated;
    });
  }

  private toAuditSnapshot(record: ExceptionRecordWithRelations): Prisma.InputJsonValue {
    return {
      id: record.id,
      type: record.type,
      status: record.status,
      customerId: record.customerId,
      warehouseId: record.warehouseId,
      productId: record.productId,
      inboundItemId: record.inboundItemId,
      inventoryItemId: record.inventoryItemId,
      rawValue: record.rawValue,
      resolutionNote: record.resolutionNote,
      resolvedById: record.resolvedById,
      resolvedAt: record.resolvedAt?.toISOString() ?? null,
    };
  }
}
