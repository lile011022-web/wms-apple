import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerStatus, InventoryStatus, OutboundBoxStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { InventoryService } from '../inventory/inventory.service';
import { AddOutboundBoxItemDto } from './dto/add-outbound-box-item.dto';
import { CreateOutboundBoxDto } from './dto/create-outbound-box.dto';
import { ListOutboundAvailableItemsQueryDto } from './dto/list-outbound-available-items-query.dto';
import { ListOutboundBoxesQueryDto } from './dto/list-outbound-boxes-query.dto';
import {
  OutboundBoxRecord,
  OutboundInventoryItemRecord,
  OutboundRepository,
} from './outbound.repository';

@Injectable()
export class OutboundService {
  constructor(
    private readonly outboundRepository: OutboundRepository,
    private readonly inventoryService: InventoryService,
  ) {}

  async createBox(dto: CreateOutboundBoxDto, operator: AuthenticatedUser) {
    const customerId = await this.requireCustomerId(dto.customerId);
    const warehouseId = await this.requireWarehouseId(dto.warehouseId);
    const [customer, warehouse] = await Promise.all([
      this.outboundRepository.findCustomerById(customerId),
      this.outboundRepository.findWarehouseById(warehouseId),
    ]);

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }
    if (customer.status !== CustomerStatus.ACTIVE) {
      throw new ConflictException('Inactive customer cannot be used for outbound packing.');
    }
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found.');
    }
    if (!warehouse.isActive) {
      throw new ConflictException('Inactive warehouse cannot be used for outbound packing.');
    }

    const boxNo = this.normalizeBoxNo(dto.boxNo) ?? this.generateBoxNo();
    const existing = await this.outboundRepository.findBoxByNo(warehouseId, boxNo);
    if (existing) {
      throw new ConflictException('Outbound box number already exists in this warehouse.');
    }

    const box = await this.outboundRepository.createBox({
      boxNo,
      customer: { connect: { id: customer.id } },
      warehouse: { connect: { id: warehouse.id } },
      createdBy: { connect: { id: operator.id } },
      notes: this.trimOptional(dto.notes),
    });

    return this.toBoxResponse(box);
  }

  async listBoxes(query: ListOutboundBoxesQueryDto) {
    const allowedSortFields = new Set(['createdAt', 'updatedAt', 'boxNo', 'sealedAt', 'status']);
    const sortBy = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'createdAt';
    const [total, boxes] = await this.outboundRepository.findBoxes({
      where: this.toBoxWhere(query),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { [sortBy]: query.sortOrder } as Prisma.OutboundBoxOrderByWithRelationInput,
    });

    return {
      items: boxes.map((box) => this.toBoxResponse(box)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getBox(id: string) {
    const box = await this.findExistingBox(id);
    return this.toBoxResponse(box);
  }

  async listAvailableItems(query: ListOutboundAvailableItemsQueryDto) {
    const customerId = await this.requireCustomerId(query.customerId);
    return this.inventoryService.listAvailableForOutbound({
      ...query,
      customerId,
      availableForOutbound: true,
      status: InventoryStatus.IN_STOCK,
    });
  }

  async addItem(boxId: string, dto: AddOutboundBoxItemDto) {
    const box = await this.findOpenBox(boxId);
    const inventoryItem = await this.findExistingInventoryItem(dto.inventoryItemId);

    this.assertInventoryCanJoinBox(box, inventoryItem);

    const updated = await this.outboundRepository.addItemToBox(box.id, inventoryItem.id);
    return this.toBoxResponse(updated);
  }

  async removeItem(boxId: string, itemId: string) {
    const box = await this.findOpenBox(boxId);
    const boxItem = box.items.find((item) => item.inventoryItemId === itemId || item.id === itemId);

    if (!boxItem) {
      throw new NotFoundException('Outbound box item not found.');
    }

    const result = await this.outboundRepository.removeItemFromBox(box.id, boxItem.inventoryItemId);
    return {
      removedItemId: result.deleted.inventoryItemId,
      box: this.toBoxResponse(result.box),
    };
  }

  async clearItems(boxId: string) {
    const box = await this.findOpenBox(boxId);
    const itemIds = box.items.map((item) => item.inventoryItemId);
    const result = await this.outboundRepository.clearBoxItems(box.id, itemIds);

    return {
      clearedCount: result.clearedCount,
      box: this.toBoxResponse(result.box),
    };
  }

  async sealBox(boxId: string, operator: AuthenticatedUser) {
    const box = await this.findOpenBox(boxId);
    if (box.items.length === 0) {
      throw new BadRequestException('Outbound box has no items to seal.');
    }

    const sealed = await this.outboundRepository.sealBox({
      boxId: box.id,
      operatorId: operator.id,
    });
    return this.toBoxResponse(sealed);
  }

  private async findExistingBox(id: string) {
    const box = await this.outboundRepository.findBoxById(id);
    if (!box) {
      throw new NotFoundException('Outbound box not found.');
    }
    return box;
  }

  private async findOpenBox(id: string) {
    const box = await this.findExistingBox(id);
    if (box.status !== OutboundBoxStatus.OPEN) {
      throw new ConflictException('Only open outbound boxes can be changed.');
    }
    return box;
  }

  private async findExistingInventoryItem(id: string) {
    const inventoryItem = await this.outboundRepository.findInventoryItemById(id);
    if (!inventoryItem) {
      throw new NotFoundException('Inventory item not found.');
    }
    return inventoryItem;
  }

  private assertInventoryCanJoinBox(
    box: OutboundBoxRecord,
    inventoryItem: OutboundInventoryItemRecord,
  ) {
    if (inventoryItem.customerId !== box.customerId) {
      throw new ConflictException('Inventory item does not belong to the outbound customer.');
    }
    if (inventoryItem.warehouseId !== box.warehouseId) {
      throw new ConflictException('Inventory item does not belong to the outbound warehouse.');
    }
    if (inventoryItem.status !== InventoryStatus.IN_STOCK) {
      throw new ConflictException('Only in-stock inventory can be packed.');
    }
    if (inventoryItem.outboundBoxItems.length > 0) {
      throw new ConflictException('Inventory item is already packed in an outbound box.');
    }
  }

  private async requireCustomerId(customerId?: string) {
    const normalized = this.trimOptional(customerId);
    if (!normalized) {
      throw new BadRequestException('customerId is required for outbound packing.');
    }
    return normalized;
  }

  private async requireWarehouseId(warehouseId?: string) {
    const normalized = this.trimOptional(warehouseId);
    if (!normalized) {
      throw new BadRequestException('warehouseId is required for outbound packing.');
    }
    return normalized;
  }

  private toBoxWhere(query: ListOutboundBoxesQueryDto): Prisma.OutboundBoxWhereInput {
    const search = this.trimOptional(query.search);

    return {
      customerId: this.trimOptional(query.customerId),
      warehouseId: this.trimOptional(query.warehouseId),
      status: query.status,
      OR: search
        ? [
            { boxNo: { contains: search, mode: 'insensitive' } },
            { customer: { code: { contains: search, mode: 'insensitive' } } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
  }

  private toBoxResponse(box: OutboundBoxRecord) {
    return {
      id: box.id,
      boxNo: box.boxNo,
      status: box.status,
      customer: {
        id: box.customer.id,
        code: box.customer.code,
        name: box.customer.name,
      },
      warehouse: {
        id: box.warehouse.id,
        code: box.warehouse.code,
        name: box.warehouse.name,
      },
      createdBy: box.createdBy,
      itemCount: box.items.length,
      items: box.items.map((item) => ({
        id: item.id,
        inventoryItemId: item.inventoryItemId,
        packedAt: item.packedAt,
        inventoryItem: {
          id: item.inventoryItem.id,
          product: {
            id: item.inventoryItem.product.id,
            sku: item.inventoryItem.product.sku,
            brand: item.inventoryItem.product.brand,
            name: item.inventoryItem.product.name,
            model: item.inventoryItem.product.model,
            category: item.inventoryItem.product.category,
            color: item.inventoryItem.product.color,
            capacity: item.inventoryItem.product.capacity,
            requiresImei: item.inventoryItem.product.requiresImei,
            status: item.inventoryItem.product.status,
            upcs: item.inventoryItem.product.upcs.map((upc) => upc.upc),
          },
          upc: item.inventoryItem.upc,
          upsTrackingNo: item.inventoryItem.upsTrackingNo,
          imei: item.inventoryItem.imei,
          serial: item.inventoryItem.serial,
          status: item.inventoryItem.status,
          receivedAt: item.inventoryItem.receivedAt,
          packedAt: item.inventoryItem.packedAt,
        },
      })),
      notes: box.notes,
      sealedAt: box.sealedAt,
      createdAt: box.createdAt,
      updatedAt: box.updatedAt,
    };
  }

  private normalizeBoxNo(value?: string) {
    return this.trimOptional(value)?.toUpperCase();
  }

  private generateBoxNo() {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `BOX-${timestamp}-${suffix}`;
  }

  private trimOptional(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }
}
