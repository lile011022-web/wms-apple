import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma, ReportExportStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ReportFilterDto } from './dto/report-filter.dto';
import { ReportType } from './dto/report-type';

const exportInclude = {
  requestedBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
};

export type ReportExportRecord = NonNullable<
  Awaited<ReturnType<ReportsRepository['findExportById']>>
>;

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  countRows(reportType: ReportType, filters: ReportFilterDto) {
    switch (reportType) {
      case ReportType.INBOUND_DETAIL:
        return this.prisma.inboundItem.count({ where: this.toInboundWhere(filters) });
      case ReportType.OUTBOUND_DETAIL:
        return this.prisma.outboundBoxItem.count({ where: this.toOutboundWhere(filters) });
      case ReportType.INVENTORY_DETAIL:
        return this.prisma.inventoryItem.count({ where: this.toInventoryWhere(filters) });
      case ReportType.EXCEPTION_DETAIL:
        return this.prisma.exceptionRecord.count({ where: this.toExceptionWhere(filters) });
      case ReportType.CUSTOMER_CHANGE_LOG:
        return this.prisma.customerChangeLog.count({ where: this.toCustomerChangeWhere(filters) });
      case ReportType.AUDIT_LOG:
        return this.prisma.auditLog.count({ where: this.toAuditWhere(filters) });
    }
  }

  async findRows(reportType: ReportType, filters: ReportFilterDto, take: number) {
    switch (reportType) {
      case ReportType.INBOUND_DETAIL:
        return this.prisma.inboundItem.findMany({
          where: this.toInboundWhere(filters),
          take,
          orderBy: { scannedAt: 'desc' },
          include: {
            customer: true,
            product: true,
            inboundBatch: { include: { warehouse: true } },
            inventoryItem: true,
          },
        });
      case ReportType.OUTBOUND_DETAIL:
        return this.prisma.outboundBoxItem.findMany({
          where: this.toOutboundWhere(filters),
          take,
          orderBy: { packedAt: 'desc' },
          include: {
            outboundBox: { include: { customer: true, warehouse: true } },
            inventoryItem: { include: { product: true } },
          },
        });
      case ReportType.INVENTORY_DETAIL:
        return this.prisma.inventoryItem.findMany({
          where: this.toInventoryWhere(filters),
          take,
          orderBy: { receivedAt: 'desc' },
          include: {
            customer: true,
            warehouse: true,
            product: true,
            inboundBatch: true,
            outboundBoxItems: {
              include: { outboundBox: true },
              orderBy: { packedAt: 'desc' },
            },
          },
        });
      case ReportType.EXCEPTION_DETAIL:
        return this.prisma.exceptionRecord.findMany({
          where: this.toExceptionWhere(filters),
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            customer: true,
            warehouse: true,
            product: true,
          },
        });
      case ReportType.CUSTOMER_CHANGE_LOG:
        return this.prisma.customerChangeLog.findMany({
          where: this.toCustomerChangeWhere(filters),
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            oldCustomer: true,
            newCustomer: true,
            operator: { select: { id: true, email: true, name: true } },
          },
        });
      case ReportType.AUDIT_LOG:
        return this.prisma.auditLog.findMany({
          where: this.toAuditWhere(filters),
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            operator: { select: { id: true, email: true, name: true } },
          },
        });
    }
  }

  createExport(input: {
    reportType: ReportType;
    requestedById: string;
    filters: Prisma.InputJsonValue;
  }) {
    return this.prisma.reportExport.create({
      data: {
        reportType: input.reportType,
        requestedById: input.requestedById,
        filters: input.filters,
      },
      include: exportInclude,
    });
  }

  updateExport(input: {
    id: string;
    status: ReportExportStatus;
    fileUrl?: string;
    errorMessage?: string;
    filters?: Prisma.InputJsonValue;
    expiresAt?: Date;
  }) {
    return this.prisma.reportExport.update({
      where: { id: input.id },
      data: {
        status: input.status,
        fileUrl: input.fileUrl,
        errorMessage: input.errorMessage,
        filters: input.filters,
        expiresAt: input.expiresAt,
      },
      include: exportInclude,
    });
  }

  listExports(params: {
    requestedById: string;
    reportType?: ReportType;
    status?: ReportExportStatus;
    skip: number;
    take: number;
  }) {
    const where: Prisma.ReportExportWhereInput = {
      requestedById: params.requestedById,
      reportType: params.reportType,
      status: params.status,
    };

    return this.prisma.$transaction([
      this.prisma.reportExport.count({ where }),
      this.prisma.reportExport.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: exportInclude,
      }),
    ]);
  }

  findExportById(id: string) {
    return this.prisma.reportExport.findUnique({
      where: { id },
      include: exportInclude,
    });
  }

  createAuditLog(input: {
    exportId: string;
    operatorId: string;
    reportType: ReportType;
    rowCount: number;
    format: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        action: AuditAction.REPORT_EXPORT,
        resourceType: 'report-export',
        resourceId: input.exportId,
        operatorId: input.operatorId,
        afterSnapshot: {
          exportId: input.exportId,
          reportType: input.reportType,
          rowCount: input.rowCount,
          format: input.format,
        },
        metadata: {
          reportType: input.reportType,
          rowCount: input.rowCount,
          format: input.format,
        },
      },
    });
  }

  private toInboundWhere(filters: ReportFilterDto): Prisma.InboundItemWhereInput {
    const search = this.trimOptional(filters.search);
    return {
      inboundBatchId: this.trimOptional(filters.batchId),
      customerId: this.trimOptional(filters.customerId),
      productId: this.trimOptional(filters.productId),
      status: filters.inboundStatus,
      upc: this.contains(filters.upc),
      imei: this.contains(filters.imei),
      serial: this.contains(filters.serial, true),
      upsTrackingNo: this.contains(filters.upsTrackingNo, true),
      scannedAt: this.toDateRange(filters),
      inboundBatch: {
        warehouseId: this.trimOptional(filters.warehouseId),
      },
      OR: search
        ? [
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

  private toInventoryWhere(filters: ReportFilterDto): Prisma.InventoryItemWhereInput {
    const search = this.trimOptional(filters.search);
    return {
      customerId: this.trimOptional(filters.customerId),
      warehouseId: this.trimOptional(filters.warehouseId),
      productId: this.trimOptional(filters.productId),
      status: filters.inventoryStatus,
      upc: this.contains(filters.upc),
      imei: this.contains(filters.imei),
      serial: this.contains(filters.serial, true),
      upsTrackingNo: this.contains(filters.upsTrackingNo, true),
      receivedAt: this.toDateRange(filters),
      OR: search
        ? [
            { upc: { contains: search } },
            { imei: { contains: search } },
            { serial: { contains: search, mode: 'insensitive' } },
            { upsTrackingNo: { contains: search, mode: 'insensitive' } },
            { customer: { code: { contains: search, mode: 'insensitive' } } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            { product: { sku: { contains: search, mode: 'insensitive' } } },
            { product: { name: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
  }

  private toOutboundWhere(filters: ReportFilterDto): Prisma.OutboundBoxItemWhereInput {
    const search = this.trimOptional(filters.search);
    return {
      packedAt: this.toDateRange(filters),
      outboundBox: {
        customerId: this.trimOptional(filters.customerId),
        warehouseId: this.trimOptional(filters.warehouseId),
        status: filters.outboundStatus,
        boxNo: this.contains(filters.boxNo, true),
      },
      inventoryItem: {
        productId: this.trimOptional(filters.productId),
        upc: this.contains(filters.upc),
        imei: this.contains(filters.imei),
        serial: this.contains(filters.serial, true),
        upsTrackingNo: this.contains(filters.upsTrackingNo, true),
      },
      OR: search
        ? [
            { outboundBox: { boxNo: { contains: search, mode: 'insensitive' } } },
            { outboundBox: { customer: { code: { contains: search, mode: 'insensitive' } } } },
            { outboundBox: { customer: { name: { contains: search, mode: 'insensitive' } } } },
            { inventoryItem: { upc: { contains: search } } },
            { inventoryItem: { upsTrackingNo: { contains: search, mode: 'insensitive' } } },
            { inventoryItem: { imei: { contains: search } } },
            { inventoryItem: { serial: { contains: search, mode: 'insensitive' } } },
            { inventoryItem: { product: { sku: { contains: search, mode: 'insensitive' } } } },
            { inventoryItem: { product: { name: { contains: search, mode: 'insensitive' } } } },
          ]
        : undefined,
    };
  }

  private toExceptionWhere(filters: ReportFilterDto): Prisma.ExceptionRecordWhereInput {
    const search = this.trimOptional(filters.search);
    return {
      customerId: this.trimOptional(filters.customerId),
      warehouseId: this.trimOptional(filters.warehouseId),
      productId: this.trimOptional(filters.productId),
      type: filters.exceptionType,
      status: filters.exceptionStatus,
      upc: this.contains(filters.upc),
      imei: this.contains(filters.imei),
      serial: this.contains(filters.serial, true),
      upsTrackingNo: this.contains(filters.upsTrackingNo, true),
      createdAt: this.toDateRange(filters),
      OR: search
        ? [
            { rawValue: { contains: search, mode: 'insensitive' } },
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

  private toCustomerChangeWhere(filters: ReportFilterDto): Prisma.CustomerChangeLogWhereInput {
    const search = this.trimOptional(filters.search);
    return {
      oldCustomerId: this.trimOptional(filters.customerId),
      operatorId: this.trimOptional(filters.operatorId),
      OR: search
        ? [
            { reason: { contains: search, mode: 'insensitive' } },
            { oldCustomer: { code: { contains: search, mode: 'insensitive' } } },
            { oldCustomer: { name: { contains: search, mode: 'insensitive' } } },
            { newCustomer: { code: { contains: search, mode: 'insensitive' } } },
            { newCustomer: { name: { contains: search, mode: 'insensitive' } } },
            { operator: { email: { contains: search, mode: 'insensitive' } } },
            { operator: { name: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
      createdAt: this.toDateRange(filters),
    };
  }

  private toAuditWhere(filters: ReportFilterDto): Prisma.AuditLogWhereInput {
    const search = this.trimOptional(filters.search);
    return {
      action: filters.auditAction,
      operatorId: this.trimOptional(filters.operatorId),
      resourceType: this.trimOptional(filters.resourceType),
      createdAt: this.toDateRange(filters),
      OR: search
        ? [
            { resourceType: { contains: search, mode: 'insensitive' } },
            { resourceId: { contains: search, mode: 'insensitive' } },
            { operator: { email: { contains: search, mode: 'insensitive' } } },
            { operator: { name: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
  }

  private toDateRange(filters: ReportFilterDto) {
    if (!filters.dateFrom && !filters.dateTo) {
      return undefined;
    }
    return {
      gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
      lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
    };
  }

  private contains(value?: string, insensitive = false) {
    const trimmed = this.trimOptional(value);
    if (!trimmed) {
      return undefined;
    }
    return insensitive
      ? { contains: trimmed, mode: 'insensitive' as const }
      : { contains: trimmed };
  }

  private trimOptional(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed || undefined;
  }
}
