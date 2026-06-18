import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { PrismaService } from '../../database/prisma.service';

export type AuditContext = {
  operatorId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
};

export type CreateAuditLogInput = AuditContext & {
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  beforeSnapshot?: Prisma.InputJsonValue;
  afterSnapshot?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: CreateAuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        operatorId: input.operatorId,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        beforeSnapshot: input.beforeSnapshot,
        afterSnapshot: input.afterSnapshot,
        metadata: input.metadata,
      },
    });
  }

  async recent() {
    const logs = await this.prisma.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: this.getOperatorInclude(),
    });

    return {
      items: logs.map((log) => this.toResponse(log)),
    };
  }

  async list(query: ListAuditLogsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.toWhere(query);
    const [total, logs] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: this.toOrderBy(query),
        include: this.getOperatorInclude(),
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      items: logs.map((log) => this.toResponse(log)),
    };
  }

  private toWhere(query: ListAuditLogsQueryDto): Prisma.AuditLogWhereInput {
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.dateFrom) {
      createdAt.gte = new Date(query.dateFrom);
    }
    if (query.dateTo) {
      createdAt.lte = new Date(query.dateTo);
    }

    return {
      action: query.action,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      operatorId: query.operatorId,
      requestId: query.requestId,
      createdAt: Object.keys(createdAt).length ? createdAt : undefined,
      OR: this.toSearchWhere(query.search),
    };
  }

  private toSearchWhere(search?: string): Prisma.AuditLogWhereInput[] | undefined {
    const trimmed = search?.trim();
    if (!trimmed) {
      return undefined;
    }

    const conditions: Prisma.AuditLogWhereInput[] = [
      { resourceType: { contains: trimmed, mode: 'insensitive' } },
      { resourceId: { contains: trimmed, mode: 'insensitive' } },
      { requestId: { contains: trimmed, mode: 'insensitive' } },
      { operator: { email: { contains: trimmed, mode: 'insensitive' } } },
      { operator: { name: { contains: trimmed, mode: 'insensitive' } } },
    ];
    if ((Object.values(AuditAction) as string[]).includes(trimmed)) {
      conditions.unshift({ action: trimmed as AuditAction });
    }

    return conditions;
  }

  private toOrderBy(query: ListAuditLogsQueryDto): Prisma.AuditLogOrderByWithRelationInput {
    const sortOrder = query.sortOrder ?? 'desc';
    const allowed = new Set(['createdAt', 'action', 'resourceType']);
    const sortBy = query.sortBy && allowed.has(query.sortBy) ? query.sortBy : 'createdAt';

    return { [sortBy]: sortOrder };
  }

  private getOperatorInclude() {
    return {
      operator: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    } as const;
  }

  private toResponse(
    log: Prisma.AuditLogGetPayload<{
      include: ReturnType<AuditLogsService['getOperatorInclude']>;
    }>,
  ) {
    return {
      id: log.id,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      operator: log.operator,
      requestId: log.requestId,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      beforeSnapshot: log.beforeSnapshot,
      afterSnapshot: log.afterSnapshot,
      metadata: log.metadata,
      createdAt: log.createdAt,
    };
  }
}
