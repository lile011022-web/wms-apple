import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerStatus, InventoryStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CommitCustomerChangeDto } from './dto/commit-customer-change.dto';
import { ListCustomerChangeCandidatesQueryDto } from './dto/list-customer-change-candidates-query.dto';
import { ListCustomerChangeLogsQueryDto } from './dto/list-customer-change-logs-query.dto';
import { PreviewCustomerChangeDto } from './dto/preview-customer-change.dto';
import {
  CustomerChangeItemRecord,
  CustomerChangeLogRecord,
  CustomerChangeRepository,
} from './customer-change.repository';

@Injectable()
export class CustomerChangeService {
  constructor(private readonly customerChangeRepository: CustomerChangeRepository) {}

  async listCandidates(query: ListCustomerChangeCandidatesQueryDto) {
    const normalizedQuery = this.normalizeCandidateQuery(query);
    const allowedSortFields = new Set(['scannedAt', 'createdAt', 'updatedAt', 'upc', 'imei']);
    const sortBy = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'scannedAt';
    const [total, items] = await this.customerChangeRepository.findCandidates({
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      ...normalizedQuery,
      orderBy: { [sortBy]: query.sortOrder } as Prisma.InboundItemOrderByWithRelationInput,
    });

    return {
      items: items.map((item) => this.toCandidateResponse(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async preview(dto: PreviewCustomerChangeDto) {
    const input = this.normalizeChangeInput(dto);
    const { currentCustomer, newCustomer } = await this.validateCustomers(
      input.currentCustomerId,
      input.newCustomerId,
    );
    const items = await this.loadConsistentItems(input.itemIds, input.currentCustomerId);
    const blockedItems = items.filter((item) => !this.isItemChangeable(item));

    return {
      previewToken: this.createPreviewToken(items, input.currentCustomerId, input.newCustomerId),
      canCommit: blockedItems.length === 0,
      currentCustomer: this.toCustomerRef(currentCustomer),
      newCustomer: this.toCustomerRef(newCustomer),
      affectedCount: items.length,
      blockedCount: blockedItems.length,
      blockedItems: blockedItems.map((item) => this.toBlockedItemResponse(item)),
      affectedItems: items.map((item) => this.toCandidateResponse(item)),
      impact: {
        inboundItems: items.length,
        inventoryItems: items.filter((item) => item.inventoryItem).length,
        exceptionRecords: items.reduce((sum, item) => sum + item.exceptions.length, 0),
      },
    };
  }

  async commit(dto: CommitCustomerChangeDto, operator: AuthenticatedUser) {
    const input = this.normalizeChangeInput(dto);
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Customer change reason is required.');
    }

    const preview = await this.preview({
      currentCustomerId: input.currentCustomerId,
      newCustomerId: input.newCustomerId,
      inboundItemIds: input.itemIds,
    });
    if (!preview.canCommit) {
      throw new ConflictException('Customer change preview contains blocked records.');
    }
    if (preview.previewToken !== dto.previewToken.trim()) {
      throw new ConflictException('Customer change preview is stale. Preview again before commit.');
    }

    const items = await this.loadConsistentItems(input.itemIds, input.currentCustomerId);
    const beforeSnapshot = this.toBatchSnapshot(items, input.currentCustomerId);
    const afterSnapshot = {
      oldCustomerId: input.currentCustomerId,
      affectedCount: items.length,
      affectedItemIds: input.itemIds,
      newCustomerId: input.newCustomerId,
      reason,
      operatorId: operator.id,
      items: items.map((item) => ({
        inboundItemId: item.id,
        inventoryItemId: item.inventoryItemId,
        customerId: input.newCustomerId,
        inventoryCustomerId: input.newCustomerId,
        inventoryStatus: item.inventoryItem?.status ?? null,
        upc: item.upc,
        imei: item.imei,
        serial: item.serial,
        upsTrackingNo: item.upsTrackingNo,
      })),
    };

    const log = await this.customerChangeRepository.commit({
      itemIds: input.itemIds,
      oldCustomerId: input.currentCustomerId,
      newCustomerId: input.newCustomerId,
      operatorId: operator.id,
      reason,
      beforeSnapshot,
      afterSnapshot,
    });

    return this.toLogResponse(log);
  }

  async listLogs(query: ListCustomerChangeLogsQueryDto) {
    const allowedSortFields = new Set(['createdAt', 'affectedCount']);
    const sortBy = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'createdAt';
    const [total, logs] = await this.customerChangeRepository.findLogs({
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      search: this.trimOptional(query.search),
      oldCustomerId: this.trimOptional(query.oldCustomerId),
      newCustomerId: this.trimOptional(query.newCustomerId),
      operatorId: this.trimOptional(query.operatorId),
      orderBy: { [sortBy]: query.sortOrder } as Prisma.CustomerChangeLogOrderByWithRelationInput,
    });

    return {
      items: logs.map((log) => this.toLogResponse(log)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  private async validateCustomers(currentCustomerId: string, newCustomerId: string) {
    if (currentCustomerId === newCustomerId) {
      throw new BadRequestException('New customer must be different from current customer.');
    }

    const [currentCustomer, newCustomer] = await Promise.all([
      this.customerChangeRepository.findCustomerById(currentCustomerId),
      this.customerChangeRepository.findCustomerById(newCustomerId),
    ]);
    if (!currentCustomer) {
      throw new NotFoundException('Current customer not found.');
    }
    if (!newCustomer) {
      throw new NotFoundException('New customer not found.');
    }
    if (newCustomer.status !== CustomerStatus.ACTIVE) {
      throw new ConflictException('New customer must be active.');
    }

    return { currentCustomer, newCustomer };
  }

  private async loadConsistentItems(itemIds: string[], currentCustomerId: string) {
    const items = await this.customerChangeRepository.findItemsByIds(itemIds);
    if (items.length !== itemIds.length) {
      throw new NotFoundException('One or more inbound records were not found.');
    }

    const sortedItems = this.sortItems(items);
    const mismatchedItem = sortedItems.find((item) => item.customerId !== currentCustomerId);
    if (mismatchedItem) {
      throw new ConflictException(
        'One or more inbound records no longer belong to current customer.',
      );
    }

    return sortedItems;
  }

  private isItemChangeable(item: CustomerChangeItemRecord) {
    return (
      item.status === 'CONFIRMED' &&
      item.inventoryItem &&
      item.inventoryItem.status !== InventoryStatus.PACKED &&
      item.inventoryItem.status !== InventoryStatus.OUTBOUND &&
      item.inventoryItem.status !== InventoryStatus.VOIDED
    );
  }

  private createPreviewToken(
    items: CustomerChangeItemRecord[],
    currentCustomerId: string,
    newCustomerId: string,
  ) {
    const payload = {
      currentCustomerId,
      newCustomerId,
      items: this.sortItems(items).map((item) => ({
        id: item.id,
        customerId: item.customerId,
        inventoryItemId: item.inventoryItemId,
        inventoryStatus: item.inventoryItem?.status ?? null,
        updatedAt: item.updatedAt.toISOString(),
        inventoryUpdatedAt: item.inventoryItem?.updatedAt.toISOString() ?? null,
      })),
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private normalizeCandidateQuery(query: ListCustomerChangeCandidatesQueryDto) {
    return {
      search: this.trimOptional(query.search),
      currentCustomerId: this.trimOptional(query.currentCustomerId),
      warehouseId: this.trimOptional(query.warehouseId),
      upsTrackingNo: query.upsTrackingNo ? query.upsTrackingNo.trim().toUpperCase() : undefined,
      upc: this.trimOptional(query.upc),
      imei: this.trimOptional(query.imei),
      productName: this.trimOptional(query.productName),
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    };
  }

  private normalizeChangeInput(dto: PreviewCustomerChangeDto | CommitCustomerChangeDto) {
    const itemIds = [...new Set(dto.inboundItemIds.map((id) => id.trim()).filter(Boolean))].sort();
    if (itemIds.length === 0) {
      throw new BadRequestException('At least one inbound record is required.');
    }

    return {
      currentCustomerId: dto.currentCustomerId.trim(),
      newCustomerId: dto.newCustomerId.trim(),
      itemIds,
    };
  }

  private sortItems(items: CustomerChangeItemRecord[]) {
    return [...items].sort((left, right) => left.id.localeCompare(right.id));
  }

  private toBatchSnapshot(
    items: CustomerChangeItemRecord[],
    currentCustomerId: string,
  ): Prisma.InputJsonValue {
    return {
      oldCustomerId: currentCustomerId,
      affectedCount: items.length,
      affectedItemIds: items.map((item) => item.id),
      items: items.map((item) => ({
        inboundItemId: item.id,
        inventoryItemId: item.inventoryItemId,
        customerId: item.customerId,
        inventoryCustomerId: item.inventoryItem?.customerId ?? null,
        inventoryStatus: item.inventoryItem?.status ?? null,
        upc: item.upc,
        imei: item.imei,
        serial: item.serial,
        upsTrackingNo: item.upsTrackingNo,
      })),
    };
  }

  private toCandidateResponse(item: CustomerChangeItemRecord) {
    const latestOutboundBox = item.inventoryItem?.outboundBoxItems[0]?.outboundBox;
    return {
      id: item.id,
      customer: this.toCustomerRef(item.customer),
      product: item.product
        ? {
            id: item.product.id,
            sku: item.product.sku,
            brand: item.product.brand,
            name: item.product.name,
            model: item.product.model,
            category: item.product.category,
            color: item.product.color,
            capacity: item.product.capacity,
            upcs: item.product.upcs.map((upc) => upc.upc),
          }
        : null,
      warehouse: {
        id: item.inboundBatch.warehouse.id,
        code: item.inboundBatch.warehouse.code,
        name: item.inboundBatch.warehouse.name,
      },
      batch: {
        id: item.inboundBatch.id,
        batchNo: item.inboundBatch.batchNo,
        confirmedAt: item.inboundBatch.confirmedAt,
        operator: item.inboundBatch.operator,
      },
      inventoryItem: item.inventoryItem
        ? {
            id: item.inventoryItem.id,
            customer: this.toCustomerRef(item.inventoryItem.customer),
            status: item.inventoryItem.status,
            latestOutboundBox: latestOutboundBox ?? null,
          }
        : null,
      upsTrackingNo: item.upsTrackingNo,
      upc: item.upc,
      imei: item.imei,
      serial: item.serial,
      status: item.status,
      scannedAt: item.scannedAt,
      changeable: this.isItemChangeable(item),
    };
  }

  private toBlockedItemResponse(item: CustomerChangeItemRecord) {
    return {
      id: item.id,
      inventoryItemId: item.inventoryItemId,
      inventoryStatus: item.inventoryItem?.status ?? null,
      reason: item.inventoryItem
        ? 'Only in-stock or exception inventory can change customer.'
        : 'Inbound record has no linked inventory item.',
    };
  }

  private toLogResponse(log: CustomerChangeLogRecord) {
    return {
      id: log.id,
      oldCustomer: this.toCustomerRef(log.oldCustomer),
      newCustomer: this.toCustomerRef(log.newCustomer),
      operator: log.operator,
      reason: log.reason,
      affectedCount: log.affectedCount,
      affectedItemIds: log.affectedItemIds,
      beforeSnapshot: log.beforeSnapshot,
      afterSnapshot: log.afterSnapshot,
      createdAt: log.createdAt,
    };
  }

  private toCustomerRef(customer: { id: string; code: string; name: string }) {
    return {
      id: customer.id,
      code: customer.code,
      name: customer.name,
    };
  }

  private trimOptional(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed || undefined;
  }
}
