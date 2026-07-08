import { Injectable } from '@nestjs/common';
import { AuditAction, InboundBatchStatus, Prisma, ReportExportStatus } from '@prisma/client';
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

  findInboundBatchOptions(params: {
    customerId?: string;
    search?: string;
    skip: number;
    take: number;
  }) {
    const search = this.trimOptional(params.search);
    const where: Prisma.InboundBatchWhereInput = {
      status: InboundBatchStatus.CONFIRMED,
      customerId: this.trimOptional(params.customerId),
      OR: search
        ? [
            { batchNo: { contains: search, mode: 'insensitive' } },
            { customer: { code: { contains: search, mode: 'insensitive' } } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };

    return this.prisma.$transaction([
      this.prisma.inboundBatch.count({ where }),
      this.prisma.inboundBatch.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: [{ confirmedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          batchNo: true,
          confirmedAt: true,
          customer: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          _count: { select: { inboundItems: true } },
        },
      }),
    ]);
  }

  findInboundBatchById(id: string) {
    return this.prisma.inboundBatch.findUnique({
      where: { id },
      select: { id: true, batchNo: true },
    });
  }

  findOutboundBoxOptions(params: {
    customerId?: string;
    warehouseId?: string;
    outboundStatus?: ReportFilterDto['outboundStatus'];
    sizePreset?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    skip: number;
    take: number;
  }) {
    const where = this.toOutboundBoxOptionWhere(params);

    return this.prisma.$transaction([
      this.prisma.outboundBox.count({ where }),
      this.prisma.outboundBox.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: [{ sealedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          boxNo: true,
          boxName: true,
          sizePreset: true,
          customSize: true,
          shippingTrackingNo: true,
          status: true,
          sealedAt: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);
  }

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
            customerAlias: true,
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
            inventoryItem: { include: { product: true, customerAlias: true } },
          },
        });
      case ReportType.INVENTORY_DETAIL:
        return this.prisma.inventoryItem.findMany({
          where: this.toInventoryWhere(filters),
          take,
          orderBy: { receivedAt: 'desc' },
          include: {
            customer: true,
            customerAlias: true,
            warehouse: true,
            product: true,
            inboundBatch: true,
            inboundItem: {
              select: {
                scannedAt: true,
              },
            },
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
      customerAliasId: this.trimOptional(filters.customerAliasId),
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
            { customerAlias: { code: { contains: search, mode: 'insensitive' } } },
            { customerAlias: { name: { contains: search, mode: 'insensitive' } } },
            { product: { sku: { contains: search, mode: 'insensitive' } } },
            { product: { name: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
  }

  private toInventoryWhere(filters: ReportFilterDto): Prisma.InventoryItemWhereInput {
    const search = this.trimOptional(filters.search);
    const boxNos = this.toStringList(filters.boxNos);
    return {
      customerId: this.trimOptional(filters.customerId),
      customerAliasId: this.trimOptional(filters.customerAliasId),
      warehouseId: this.trimOptional(filters.warehouseId),
      productId: this.trimOptional(filters.productId),
      status: filters.inventoryStatus,
      upc: this.contains(filters.upc),
      imei: this.contains(filters.imei),
      serial: this.contains(filters.serial, true),
      upsTrackingNo: this.contains(filters.upsTrackingNo, true),
      receivedAt: this.toDateRange(filters),
      outboundBoxItems:
        filters.outboundStatus || filters.boxNo || boxNos.length
          ? {
              some: {
                outboundBox: {
                  status: filters.outboundStatus,
                  boxNo: boxNos.length ? { in: boxNos } : this.contains(filters.boxNo, true),
                },
              },
            }
          : undefined,
      OR: search
        ? [
            { upc: { contains: search } },
            { imei: { contains: search } },
            { serial: { contains: search, mode: 'insensitive' } },
            { upsTrackingNo: { contains: search, mode: 'insensitive' } },
            { customer: { code: { contains: search, mode: 'insensitive' } } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            { customerAlias: { code: { contains: search, mode: 'insensitive' } } },
            { customerAlias: { name: { contains: search, mode: 'insensitive' } } },
            { product: { sku: { contains: search, mode: 'insensitive' } } },
            { product: { name: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
  }

  private toOutboundWhere(filters: ReportFilterDto): Prisma.OutboundBoxItemWhereInput {
    const search = this.trimOptional(filters.search);
    const boxNos = this.toStringList(filters.boxNos);
    return {
      packedAt: this.toDateRange(filters),
      outboundBox: {
        customerId: this.trimOptional(filters.customerId),
        warehouseId: this.trimOptional(filters.warehouseId),
        status: filters.outboundStatus,
        boxNo: boxNos.length ? { in: boxNos } : this.contains(filters.boxNo, true),
      },
      inventoryItem: {
        customerAliasId: this.trimOptional(filters.customerAliasId),
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
            {
              inventoryItem: { customerAlias: { code: { contains: search, mode: 'insensitive' } } },
            },
            {
              inventoryItem: { customerAlias: { name: { contains: search, mode: 'insensitive' } } },
            },
            { inventoryItem: { product: { sku: { contains: search, mode: 'insensitive' } } } },
            { inventoryItem: { product: { name: { contains: search, mode: 'insensitive' } } } },
          ]
        : undefined,
    };
  }

  private toOutboundBoxOptionWhere(params: {
    customerId?: string;
    warehouseId?: string;
    outboundStatus?: ReportFilterDto['outboundStatus'];
    sizePreset?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }): Prisma.OutboundBoxWhereInput {
    const search = this.trimOptional(params.search);
    const packedAt = this.toDateRange({
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    });

    return {
      customerId: this.trimOptional(params.customerId),
      warehouseId: this.trimOptional(params.warehouseId),
      status: params.outboundStatus,
      sizePreset: this.trimOptional(params.sizePreset),
      items: packedAt ? { some: { packedAt } } : undefined,
      OR: search
        ? [
            { boxNo: { contains: search, mode: 'insensitive' } },
            { boxName: { contains: search, mode: 'insensitive' } },
            { shippingTrackingNo: { contains: search, mode: 'insensitive' } },
            { customer: { code: { contains: search, mode: 'insensitive' } } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            {
              items: {
                some: {
                  inventoryItem: {
                    OR: [
                      { upc: { contains: search } },
                      { upsTrackingNo: { contains: search, mode: 'insensitive' } },
                      { imei: { contains: search } },
                      { serial: { contains: search, mode: 'insensitive' } },
                      { product: { sku: { contains: search, mode: 'insensitive' } } },
                      { product: { name: { contains: search, mode: 'insensitive' } } },
                    ],
                  },
                },
              },
            },
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

  private toStringList(values?: string[]) {
    return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  }

  private trimOptional(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed || undefined;
  }
}
