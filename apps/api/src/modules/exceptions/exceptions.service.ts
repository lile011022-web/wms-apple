import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ExceptionStatus, ExceptionType, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { BatchHandleExceptionsDto } from './dto/batch-handle-exceptions.dto';
import { HandleExceptionDto } from './dto/handle-exception.dto';
import { ListExceptionsQueryDto } from './dto/list-exceptions-query.dto';
import { ExceptionRecordWithRelations, ExceptionsRepository } from './exceptions.repository';

@Injectable()
export class ExceptionsService {
  constructor(private readonly exceptionsRepository: ExceptionsRepository) {}

  async list(query: ListExceptionsQueryDto) {
    const allowedSortFields = new Set(['createdAt', 'updatedAt', 'type', 'status']);
    const sortBy = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'createdAt';
    const [total, exceptions] = await this.exceptionsRepository.findMany({
      where: this.toWhere(query),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { [sortBy]: query.sortOrder } as Prisma.ExceptionRecordOrderByWithRelationInput,
    });

    return {
      items: exceptions.map((exception) => this.toExceptionResponse(exception)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async summary(query: ListExceptionsQueryDto) {
    const rows = await this.exceptionsRepository.getSummary(
      this.toWhere(query, { omitStatus: true }),
    );
    const byType = this.emptyTypeCounts();
    const byStatus = this.emptyStatusCounts();

    for (const row of rows) {
      byType[row.type] += row._count._all;
      byStatus[row.status] += row._count._all;
    }

    return {
      total: rows.reduce((sum, row) => sum + row._count._all, 0),
      openTotal: byStatus[ExceptionStatus.OPEN],
      byType,
      byStatus,
    };
  }

  async get(id: string) {
    return this.toExceptionResponse(await this.findExisting(id));
  }

  resolve(id: string, dto: HandleExceptionDto, operator: AuthenticatedUser) {
    return this.transition(id, ExceptionStatus.RESOLVED, dto.resolutionNote, operator);
  }

  ignore(id: string, dto: HandleExceptionDto, operator: AuthenticatedUser) {
    return this.transition(id, ExceptionStatus.IGNORED, dto.resolutionNote, operator);
  }

  invalidate(id: string, dto: HandleExceptionDto, operator: AuthenticatedUser) {
    return this.transition(id, ExceptionStatus.INVALID, dto.resolutionNote, operator);
  }

  batchResolve(dto: BatchHandleExceptionsDto, operator: AuthenticatedUser) {
    return this.batchTransition(dto, ExceptionStatus.RESOLVED, operator);
  }

  batchIgnore(dto: BatchHandleExceptionsDto, operator: AuthenticatedUser) {
    return this.batchTransition(dto, ExceptionStatus.IGNORED, operator);
  }

  private async batchTransition(
    dto: BatchHandleExceptionsDto,
    status: ExceptionStatus,
    operator: AuthenticatedUser,
  ) {
    const ids = [...new Set(dto.ids.map((id) => id.trim()).filter(Boolean))];
    const results = [];

    for (const id of ids) {
      try {
        const exception = await this.transition(id, status, dto.resolutionNote, operator);
        results.push({
          id,
          success: true,
          exception,
        });
      } catch (error) {
        results.push({
          id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown exception handling error.',
        });
      }
    }

    return {
      requestedCount: dto.ids.length,
      processedCount: results.filter((result) => result.success).length,
      failedCount: results.filter((result) => !result.success).length,
      results,
    };
  }

  private async transition(
    id: string,
    status: ExceptionStatus,
    resolutionNote: string,
    operator: AuthenticatedUser,
  ) {
    const exception = await this.findExisting(id);
    if (exception.status !== ExceptionStatus.OPEN) {
      throw new ConflictException('Only open exceptions can be handled.');
    }

    const updated = await this.exceptionsRepository.transition({
      id: exception.id,
      status,
      resolutionNote: resolutionNote.trim(),
      operatorId: operator.id,
    });
    return this.toExceptionResponse(updated);
  }

  private async findExisting(id: string) {
    const exception = await this.exceptionsRepository.findById(id);
    if (!exception) {
      throw new NotFoundException('Exception record not found.');
    }
    return exception;
  }

  private toWhere(
    query: ListExceptionsQueryDto,
    options: { omitStatus?: boolean } = {},
  ): Prisma.ExceptionRecordWhereInput {
    const search = this.trimOptional(query.search);
    return {
      type: query.type,
      status: options.omitStatus ? undefined : query.status,
      customerId: this.trimOptional(query.customerId),
      warehouseId: this.trimOptional(query.warehouseId),
      OR: search
        ? [
            { rawValue: { contains: search, mode: 'insensitive' } },
            { upsTrackingNo: { contains: search, mode: 'insensitive' } },
            { upc: { contains: search } },
            { imei: { contains: search } },
            { serial: { contains: search, mode: 'insensitive' } },
            { customer: { code: { contains: search, mode: 'insensitive' } } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            { product: { sku: { contains: search, mode: 'insensitive' } } },
            { product: { name: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
  }

  private toExceptionResponse(exception: ExceptionRecordWithRelations) {
    const latestOutboundBox = exception.inventoryItem?.outboundBoxItems[0]?.outboundBox;
    return {
      id: exception.id,
      type: exception.type,
      typeTitle: this.toTypeTitle(exception.type),
      status: exception.status,
      customer: exception.customer
        ? {
            id: exception.customer.id,
            code: exception.customer.code,
            name: exception.customer.name,
          }
        : null,
      warehouse: exception.warehouse
        ? {
            id: exception.warehouse.id,
            code: exception.warehouse.code,
            name: exception.warehouse.name,
          }
        : null,
      product: exception.product
        ? {
            id: exception.product.id,
            sku: exception.product.sku,
            brand: exception.product.brand,
            name: exception.product.name,
            model: exception.product.model,
            modelCode: exception.product.modelCode,
            category: exception.product.category,
            color: exception.product.color,
            capacity: exception.product.capacity,
            requiresImei: exception.product.requiresImei,
            upcs: exception.product.upcs.map((upc) => upc.upc),
          }
        : null,
      inboundItem: exception.inboundItem
        ? {
            id: exception.inboundItem.id,
            inboundBatch: exception.inboundItem.inboundBatch,
            status: exception.inboundItem.status,
            scannedAt: exception.inboundItem.scannedAt,
          }
        : null,
      inventoryItem: exception.inventoryItem
        ? {
            id: exception.inventoryItem.id,
            status: exception.inventoryItem.status,
            receivedAt: exception.inventoryItem.receivedAt,
            latestOutboundBox: latestOutboundBox ?? null,
          }
        : null,
      rawValue: exception.rawValue,
      upsTrackingNo: exception.upsTrackingNo,
      upc: exception.upc,
      imei: exception.imei,
      serial: exception.serial,
      resolutionNote: exception.resolutionNote,
      resolvedById: exception.resolvedById,
      resolvedAt: exception.resolvedAt,
      beforeSnapshot: exception.beforeSnapshot,
      afterSnapshot: exception.afterSnapshot,
      createdAt: exception.createdAt,
      updatedAt: exception.updatedAt,
    };
  }

  private toTypeTitle(type: ExceptionType) {
    const titles: Record<ExceptionType, string> = {
      [ExceptionType.UPC_NOT_MATCHED]: 'UPC 未匹配',
      [ExceptionType.IMEI_DUPLICATED]: 'IMEI 重复',
      [ExceptionType.UPS_DUPLICATED]: 'UPS 重复',
      [ExceptionType.CUSTOMER_OWNERSHIP_MISMATCH]: '客户归属错误',
      [ExceptionType.IMEI_NOT_INBOUNDED]: 'IMEI 未入库',
    };
    return titles[type];
  }

  private emptyTypeCounts(): Record<ExceptionType, number> {
    return {
      [ExceptionType.UPC_NOT_MATCHED]: 0,
      [ExceptionType.IMEI_DUPLICATED]: 0,
      [ExceptionType.UPS_DUPLICATED]: 0,
      [ExceptionType.CUSTOMER_OWNERSHIP_MISMATCH]: 0,
      [ExceptionType.IMEI_NOT_INBOUNDED]: 0,
    };
  }

  private emptyStatusCounts(): Record<ExceptionStatus, number> {
    return {
      [ExceptionStatus.OPEN]: 0,
      [ExceptionStatus.RESOLVED]: 0,
      [ExceptionStatus.IGNORED]: 0,
      [ExceptionStatus.INVALID]: 0,
    };
  }

  private trimOptional(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }
}
