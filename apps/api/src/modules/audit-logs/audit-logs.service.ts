import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
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
}
