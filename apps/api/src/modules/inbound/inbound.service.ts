import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerStatus,
  ExceptionType,
  InboundBatchStatus,
  InboundItemStatus,
  Prisma,
  ProductStatus,
} from '@prisma/client';
import {
  isValidImei,
  isValidPackageTracking,
  isValidSerial,
  isValidUpc,
  normalizePackageTracking,
} from '@wms-scan/shared';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { SettingsService } from '../settings/settings.service';
import { AddInboundItemDto } from './dto/add-inbound-item.dto';
import { CreateInboundDraftDto } from './dto/create-inbound-draft.dto';
import { ImportInboundItemsDto } from './dto/import-inbound-items.dto';
import { ListInboundRecordsQueryDto } from './dto/list-inbound-records-query.dto';
import { ScanInboundUpsDto } from './dto/scan-inbound-ups.dto';
import { InboundDraftRecord, InboundItemRecord, InboundRepository } from './inbound.repository';

@Injectable()
export class InboundService {
  constructor(
    private readonly inboundRepository: InboundRepository,
    private readonly settingsService: SettingsService,
  ) {}

  async createDraft(dto: CreateInboundDraftDto, operator: AuthenticatedUser) {
    const settings = await this.settingsService.getSettings();
    const customerId = dto.customerId?.trim();

    if (settings.scanRules.requiresLockedCustomer && !customerId) {
      throw new BadRequestException('Inbound scanning requires a locked customer.');
    }

    const customer = customerId
      ? await this.inboundRepository.findCustomerById(customerId)
      : undefined;
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }
    if (customer.status !== CustomerStatus.ACTIVE) {
      throw new ConflictException('Inactive customer cannot be locked for inbound scanning.');
    }

    const warehouseId = dto.warehouseId?.trim() || settings.warehouse.defaultWarehouseId;
    if (!warehouseId) {
      throw new BadRequestException('Default warehouse is not configured.');
    }
    const warehouse = await this.inboundRepository.findWarehouseById(warehouseId);
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found.');
    }
    if (!warehouse.isActive) {
      throw new ConflictException('Inactive warehouse cannot receive inbound scans.');
    }

    const draft = await this.inboundRepository.createDraft({
      batchNo: this.generateBatchNo(),
      customer: { connect: { id: customer.id } },
      warehouse: { connect: { id: warehouse.id } },
      operator: { connect: { id: operator.id } },
      status: InboundBatchStatus.DRAFT,
      notes: this.trimOptional(dto.notes),
    });

    return this.toDraftResponse(draft);
  }

  async getDraft(id: string) {
    const draft = await this.findOpenDraft(id);
    return this.toDraftResponse(draft);
  }

  async scanUps(draftId: string, dto: ScanInboundUpsDto) {
    const draft = await this.findOpenDraft(draftId);
    const upsTrackingNo = this.normalizeUps(dto.upsTrackingNo);
    const settings = await this.settingsService.getSettings();
    const duplicateCount = await this.inboundRepository.countConfirmedItemsByUps(upsTrackingNo);

    return {
      draftId: draft.id,
      upsTrackingNo,
      valid: true,
      duplicate: settings.scanRules.detectDuplicateUps && duplicateCount > 0,
      duplicateCount,
    };
  }

  async addItem(draftId: string, dto: AddInboundItemDto) {
    const draft = await this.findOpenDraft(draftId);
    const settings = await this.settingsService.getSettings();
    const upc = this.normalizeUpc(dto.upc);
    const upsTrackingNo = dto.upsTrackingNo ? this.normalizeUps(dto.upsTrackingNo) : undefined;
    const imei = dto.imei ? this.normalizeImei(dto.imei) : undefined;
    const serial = dto.serial ? this.normalizeSerial(dto.serial) : undefined;

    if (imei && serial) {
      throw new BadRequestException('Use either IMEI or Serial for one inbound item, not both.');
    }

    const productUpc = await this.inboundRepository.findProductByUpc(upc);
    if (
      !productUpc ||
      productUpc.status !== ProductStatus.ACTIVE ||
      productUpc.product.status !== ProductStatus.ACTIVE
    ) {
      const item = await this.inboundRepository.createItem(
        {
          inboundBatch: { connect: { id: draft.id } },
          customer: { connect: { id: draft.customerId } },
          upsTrackingNo,
          upc,
          imei,
          serial,
          status: InboundItemStatus.EXCEPTION,
        },
        settings.exceptionHandling.createUnmatchedUpcException
          ? {
              type: ExceptionType.UPC_NOT_MATCHED,
              customer: { connect: { id: draft.customerId } },
              warehouse: { connect: { id: draft.warehouseId } },
              rawValue: upc,
              upsTrackingNo,
              upc,
              imei,
              serial,
            }
          : undefined,
      );
      return this.toItemResponse(item);
    }

    if (productUpc.product.requiresImei && !imei) {
      throw new BadRequestException('This product requires IMEI before inbound confirmation.');
    }
    if (!productUpc.product.requiresImei && !imei && !serial) {
      throw new BadRequestException('Serial or IMEI is required for this inbound item.');
    }

    const duplicate = await this.findDuplicateIdentity(imei, serial);
    if (duplicate && settings.scanRules.detectDuplicateImei) {
      const item = await this.inboundRepository.createItem(
        {
          inboundBatch: { connect: { id: draft.id } },
          customer: { connect: { id: draft.customerId } },
          product: { connect: { id: productUpc.product.id } },
          upsTrackingNo,
          upc,
          imei,
          serial,
          status: InboundItemStatus.EXCEPTION,
        },
        settings.exceptionHandling.createDuplicateImeiException
          ? {
              type: ExceptionType.IMEI_DUPLICATED,
              customer: { connect: { id: draft.customerId } },
              warehouse: { connect: { id: draft.warehouseId } },
              product: { connect: { id: productUpc.product.id } },
              inventoryItem: { connect: { id: duplicate.id } },
              rawValue: imei ?? serial ?? upc,
              upsTrackingNo,
              upc,
              imei,
              serial,
            }
          : undefined,
      );
      return this.toItemResponse(item);
    }

    const item = await this.inboundRepository.createItem({
      inboundBatch: { connect: { id: draft.id } },
      customer: { connect: { id: draft.customerId } },
      product: { connect: { id: productUpc.product.id } },
      upsTrackingNo,
      upc,
      imei,
      serial,
      status: InboundItemStatus.PENDING,
    });

    return this.toItemResponse(item);
  }

  async importItems(draftId: string, dto: ImportInboundItemsDto) {
    await this.findOpenDraft(draftId);
    let importedCount = 0;
    const failedRows: Array<{
      lineNo: number;
      upc: string;
      upsTrackingNo?: string;
      imei?: string;
      serial?: string;
      message: string;
    }> = [];

    for (const [index, row] of dto.items.entries()) {
      const lineNo = index + 1;
      try {
        await this.addItem(draftId, row);
        importedCount += 1;
      } catch (error) {
        failedRows.push({
          lineNo,
          upc: row.upc,
          upsTrackingNo: row.upsTrackingNo,
          imei: row.imei,
          serial: row.serial,
          message: error instanceof Error ? error.message : 'Import row failed.',
        });
      }
    }

    const draft = await this.findOpenDraft(draftId);
    return {
      importedCount,
      failedCount: failedRows.length,
      failedRows,
      draft: this.toDraftResponse(draft),
    };
  }

  async removeItem(draftId: string, itemId: string) {
    await this.findOpenDraft(draftId);
    const item = await this.inboundRepository.findItemById(itemId);
    if (!item || item.inboundBatchId !== draftId) {
      throw new NotFoundException('Inbound draft item not found.');
    }
    if (item.status === InboundItemStatus.CONFIRMED) {
      throw new ConflictException('Confirmed inbound item cannot be removed.');
    }

    const deleted = await this.inboundRepository.deleteItem(item.id);
    return this.toItemResponse(deleted);
  }

  async clearDraftItems(draftId: string) {
    await this.findOpenDraft(draftId);
    const result = await this.inboundRepository.clearDraftItems(draftId);
    const draft = await this.findOpenDraft(draftId);
    return {
      clearedCount: result.count,
      draft: this.toDraftResponse(draft),
    };
  }

  async confirmDraft(draftId: string, operator: AuthenticatedUser) {
    const draft = await this.findOpenDraft(draftId);
    const confirmableItems = draft.inboundItems.filter(
      (item) => item.status === InboundItemStatus.PENDING && item.productId,
    );
    if (confirmableItems.length === 0) {
      throw new BadRequestException('Inbound draft has no confirmable items.');
    }
    this.assertNoDuplicateDraftIdentity(confirmableItems);

    const settings = await this.settingsService.getSettings();
    const confirmed = await this.inboundRepository.confirmDraft({
      draftId: draft.id,
      operatorId: operator.id,
      duplicateImeiExceptionEnabled: settings.exceptionHandling.createDuplicateImeiException,
      duplicateUpsExceptionEnabled: settings.exceptionHandling.createDuplicateUpsException,
    });

    return this.toDraftResponse(confirmed);
  }

  async listRecords(query: ListInboundRecordsQueryDto) {
    const normalizedQuery = this.normalizeRecordQuery(query);
    const allowedSortFields = new Set([
      'scannedAt',
      'createdAt',
      'updatedAt',
      'upc',
      'imei',
      'serial',
      'status',
    ]);
    const sortBy = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'scannedAt';
    const [total, items] = await this.inboundRepository.findRecords({
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      ...normalizedQuery,
      orderBy: { [sortBy]: query.sortOrder } as Prisma.InboundItemOrderByWithRelationInput,
    });

    return {
      items: items.map((item) => this.toItemResponse(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getRecord(id: string) {
    const item = await this.inboundRepository.findItemById(id);
    if (!item) {
      throw new NotFoundException('Inbound record not found.');
    }
    return this.toItemResponse(item);
  }

  async getRecordItems(batchId: string, query: ListInboundRecordsQueryDto) {
    const allowedSortFields = new Set(['scannedAt', 'createdAt', 'updatedAt', 'upc', 'imei']);
    const sortBy = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'scannedAt';
    const [total, items] = await this.inboundRepository.findRecordItemsByBatchId({
      batchId,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { [sortBy]: query.sortOrder } as Prisma.InboundItemOrderByWithRelationInput,
    });

    return {
      batchId,
      items: items.map((item) => this.toItemResponse(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async createExportPreview(query: ListInboundRecordsQueryDto) {
    const normalizedQuery = this.normalizeRecordQuery(query);
    const total = await this.inboundRepository.countRecords(normalizedQuery);

    return {
      reportType: 'inbound-records',
      estimatedRowCount: total,
      filters: normalizedQuery,
      reusableReportPayload: {
        reportType: 'inbound-records',
        filters: normalizedQuery,
      },
    };
  }

  private async findOpenDraft(id: string) {
    const draft = await this.inboundRepository.findDraftById(id);
    if (!draft) {
      throw new NotFoundException('Inbound draft not found.');
    }
    if (draft.status !== InboundBatchStatus.DRAFT) {
      throw new ConflictException('Inbound draft is already closed.');
    }
    return draft;
  }

  private async findDuplicateIdentity(imei?: string, serial?: string) {
    if (imei) {
      return this.inboundRepository.findInventoryByImei(imei);
    }
    if (serial) {
      return this.inboundRepository.findInventoryBySerial(serial);
    }
    return null;
  }

  private assertNoDuplicateDraftIdentity(
    items: Array<Pick<InboundDraftRecord['inboundItems'][number], 'imei' | 'serial'>>,
  ) {
    const duplicateImeis = this.findDuplicateValues(items.map((item) => item.imei));
    if (duplicateImeis.length > 0) {
      throw new BadRequestException(
        `本次入库单内 IMEI 重复: ${duplicateImeis.join(', ')}。请删除重复明细或修正后再确认入库。`,
      );
    }

    const duplicateSerials = this.findDuplicateValues(items.map((item) => item.serial));
    if (duplicateSerials.length > 0) {
      throw new BadRequestException(
        `本次入库单内 Serial 重复: ${duplicateSerials.join(', ')}。请删除重复明细或修正后再确认入库。`,
      );
    }
  }

  private findDuplicateValues(values: Array<string | null>) {
    const counts = new Map<string, number>();
    for (const value of values) {
      if (!value) {
        continue;
      }
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
  }

  private normalizeRecordQuery(query: ListInboundRecordsQueryDto) {
    return {
      search: this.trimOptional(query.search),
      batchId: this.trimOptional(query.batchId),
      customerId: this.trimOptional(query.customerId),
      warehouseId: this.trimOptional(query.warehouseId),
      status: query.status,
      inventoryStatus: query.inventoryStatus,
      upsTrackingNo: query.upsTrackingNo ? query.upsTrackingNo.trim().toUpperCase() : undefined,
      upc: query.upc ? query.upc.trim() : undefined,
      imei: query.imei ? query.imei.trim() : undefined,
      serial: query.serial ? query.serial.trim().toUpperCase() : undefined,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    };
  }

  private normalizeUpc(value: string) {
    const normalized = value.trim();
    if (!isValidUpc(normalized)) {
      throw new BadRequestException('Invalid UPC format.');
    }
    return normalized;
  }

  private normalizeUps(value: string) {
    const normalized = normalizePackageTracking(value);
    if (!isValidPackageTracking(normalized)) {
      throw new BadRequestException('Invalid package tracking number format.');
    }
    return normalized;
  }

  private normalizeImei(value: string) {
    const normalized = value.trim().toUpperCase();
    if (!isValidImei(normalized)) {
      throw new BadRequestException('Invalid IMEI format.');
    }
    return normalized;
  }

  private normalizeSerial(value: string) {
    const normalized = value.trim().toUpperCase();
    if (!isValidSerial(normalized)) {
      throw new BadRequestException('Invalid Serial format.');
    }
    return normalized;
  }

  private trimOptional(value?: string) {
    const trimmed = value?.trim();
    return trimmed || undefined;
  }

  private generateBatchNo() {
    const now = new Date();
    const stamp = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
      String(now.getUTCHours()).padStart(2, '0'),
      String(now.getUTCMinutes()).padStart(2, '0'),
      String(now.getUTCSeconds()).padStart(2, '0'),
    ].join('');
    return `INB-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  private toDraftResponse(draft: InboundDraftRecord) {
    return {
      id: draft.id,
      batchNo: draft.batchNo,
      status: draft.status,
      customer: {
        id: draft.customer.id,
        code: draft.customer.code,
        name: draft.customer.name,
      },
      warehouse: {
        id: draft.warehouse.id,
        code: draft.warehouse.code,
        name: draft.warehouse.name,
        timezone: draft.warehouse.timezone,
      },
      operator: draft.operator,
      notes: draft.notes,
      confirmedAt: draft.confirmedAt,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      summary: {
        totalItems: draft.inboundItems.filter((item) => item.status !== InboundItemStatus.VOIDED)
          .length,
        pendingItems: draft.inboundItems.filter((item) => item.status === InboundItemStatus.PENDING)
          .length,
        exceptionItems: draft.inboundItems.filter(
          (item) => item.status === InboundItemStatus.EXCEPTION,
        ).length,
        confirmedItems: draft.inboundItems.filter(
          (item) => item.status === InboundItemStatus.CONFIRMED,
        ).length,
      },
      items: draft.inboundItems
        .filter((item) => item.status !== InboundItemStatus.VOIDED)
        .map((item) => this.toDraftItemResponse(item)),
    };
  }

  private toDraftItemResponse(item: InboundDraftRecord['inboundItems'][number]) {
    return {
      id: item.id,
      upsTrackingNo: item.upsTrackingNo,
      upc: item.upc,
      imei: item.imei,
      serial: item.serial,
      status: item.status,
      scannedAt: item.scannedAt,
      product: item.product ? this.toProductResponse(item.product) : null,
      inventoryItemId: item.inventoryItemId,
      exceptions: item.exceptions.map((exception) => ({
        id: exception.id,
        type: exception.type,
        status: exception.status,
        rawValue: exception.rawValue,
      })),
    };
  }

  private toItemResponse(item: InboundItemRecord) {
    return {
      id: item.id,
      batch: {
        id: item.inboundBatch.id,
        batchNo: item.inboundBatch.batchNo,
        status: item.inboundBatch.status,
        confirmedAt: item.inboundBatch.confirmedAt,
        warehouse: {
          id: item.inboundBatch.warehouse.id,
          code: item.inboundBatch.warehouse.code,
          name: item.inboundBatch.warehouse.name,
        },
        operator: item.inboundBatch.operator,
      },
      customer: {
        id: item.customer.id,
        code: item.customer.code,
        name: item.customer.name,
      },
      product: item.product ? this.toProductResponse(item.product) : null,
      inventoryItemId: item.inventoryItemId,
      upsTrackingNo: item.upsTrackingNo,
      upc: item.upc,
      imei: item.imei,
      serial: item.serial,
      status: item.status,
      inventoryStatus: item.inventoryItem?.status ?? null,
      selectableForCustomerChange: item.status !== InboundItemStatus.VOIDED,
      scannedAt: item.scannedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      exceptions: item.exceptions.map((exception) => ({
        id: exception.id,
        type: exception.type,
        status: exception.status,
        rawValue: exception.rawValue,
        resolutionNote: exception.resolutionNote,
      })),
    };
  }

  private toProductResponse(product: NonNullable<InboundItemRecord['product']>) {
    return {
      id: product.id,
      sku: product.sku,
      brand: product.brand,
      name: product.name,
      model: product.model,
      category: product.category,
      color: product.color,
      capacity: product.capacity,
      requiresImei: product.requiresImei,
      status: product.status,
      upcs: product.upcs.map((upc) => upc.upc),
    };
  }
}
