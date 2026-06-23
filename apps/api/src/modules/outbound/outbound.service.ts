import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerStatus, InventoryStatus, OutboundBoxStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { InventoryService } from '../inventory/inventory.service';
import { AddOutboundBoxItemDto } from './dto/add-outbound-box-item.dto';
import { CreateOutboundBoxDto } from './dto/create-outbound-box.dto';
import { ListOutboundAvailableItemsQueryDto } from './dto/list-outbound-available-items-query.dto';
import { ListOutboundBoxItemsQueryDto } from './dto/list-outbound-box-items-query.dto';
import { ListOutboundBoxesQueryDto } from './dto/list-outbound-boxes-query.dto';
import { UpdateOutboundBoxDto } from './dto/update-outbound-box.dto';
import {
  OutboundBoxListRecord,
  OutboundBoxRecord,
  OutboundInventoryItemRecord,
  OutboundRepository,
} from './outbound.repository';

export type UploadedOutboundBoxPhotoFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const outboundBoxPhotoDirectory = 'uploads/outbound-box-photos';
const allowedPhotoMimeTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['video/mp4', '.mp4'],
  ['video/quicktime', '.mov'],
  ['video/webm', '.webm'],
]);
const maxPhotoSizeBytes = 100 * 1024 * 1024;

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

    const generatedBoxIdentity = await this.generateBoxIdentity({
      customerCode: customer.code,
      customerName: customer.name,
      warehouseId: warehouse.id,
    });
    const boxNo = generatedBoxIdentity.boxNo;
    const existing = await this.outboundRepository.findBoxByNo(warehouseId, boxNo);
    if (existing) {
      throw new ConflictException('Outbound box number already exists in this warehouse.');
    }
    await this.assertUniqueBoxName(warehouseId, generatedBoxIdentity.boxName);

    const box = await this.outboundRepository.createBoxWithAudit(
      {
        boxNo,
        boxName: generatedBoxIdentity.boxName,
        sizePreset: this.normalizeSizePreset(dto.sizePreset, '12*12*12'),
        customSize: this.normalizeCustomSize(dto.sizePreset, dto.customSize),
        weightLb: dto.weightLb ?? 45,
        shippingTrackingNo: this.trimOptional(dto.shippingTrackingNo),
        customer: { connect: { id: customer.id } },
        warehouse: { connect: { id: warehouse.id } },
        createdBy: { connect: { id: operator.id } },
        notes: this.trimOptional(dto.notes),
      },
      operator.id,
    );

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

  async listBoxItems(id: string, query: ListOutboundBoxItemsQueryDto) {
    await this.findExistingBox(id);
    const [total, items] = await this.outboundRepository.listBoxItems({
      boxId: id,
      search: this.trimOptional(query.search),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        inventoryItemId: item.inventoryItemId,
        packedAt: item.packedAt,
        inventoryItem: {
          id: item.inventoryItem.id,
          customer: item.inventoryItem.customer,
          product: item.inventoryItem.product,
          upc: item.inventoryItem.upc,
          upsTrackingNo: item.inventoryItem.upsTrackingNo,
          imei: item.inventoryItem.imei,
          serial: item.inventoryItem.serial,
          status: item.inventoryItem.status,
          receivedAt: item.inventoryItem.receivedAt,
          packedAt: item.inventoryItem.packedAt,
        },
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async updateBox(id: string, dto: UpdateOutboundBoxDto, operator: AuthenticatedUser) {
    const box = await this.findOpenBox(id);
    const data: Prisma.OutboundBoxUpdateInput = {};

    if (dto.sizePreset !== undefined) {
      data.sizePreset = this.normalizeSizePreset(dto.sizePreset);
      data.customSize = this.normalizeCustomSize(dto.sizePreset, dto.customSize) ?? null;
    } else if (dto.customSize !== undefined) {
      data.customSize = this.trimOptional(dto.customSize) ?? null;
    }
    if (dto.weightLb !== undefined) {
      data.weightLb = dto.weightLb;
    }
    if (dto.notes !== undefined) {
      data.notes = this.trimOptional(dto.notes) ?? null;
    }
    if (dto.shippingTrackingNo !== undefined) {
      data.shippingTrackingNo = this.trimOptional(dto.shippingTrackingNo) ?? null;
    }

    const updated = await this.outboundRepository.updateBoxWithAudit({
      boxId: box.id,
      operatorId: operator.id,
      data,
    });

    return this.toBoxResponse(updated);
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

  async addItem(boxId: string, dto: AddOutboundBoxItemDto, operator: AuthenticatedUser) {
    const box = await this.findOpenBox(boxId);
    const inventoryItem = await this.findExistingInventoryItem(dto.inventoryItemId);

    this.assertInventoryCanJoinBox(box, inventoryItem);

    const updated = await this.outboundRepository.addItemToBox(
      box.id,
      inventoryItem.id,
      operator.id,
    );
    return this.toBoxResponse(updated);
  }

  async removeItem(boxId: string, itemId: string, operator: AuthenticatedUser) {
    const box = await this.findOpenBox(boxId);
    const boxItem = box.items.find((item) => item.inventoryItemId === itemId || item.id === itemId);

    if (!boxItem) {
      throw new NotFoundException('Outbound box item not found.');
    }

    const result = await this.outboundRepository.removeItemFromBox(
      box.id,
      boxItem.inventoryItemId,
      operator.id,
    );
    return {
      removedItemId: result.deleted.inventoryItemId,
      box: this.toBoxResponse(result.box),
    };
  }

  async clearItems(boxId: string, operator: AuthenticatedUser) {
    const box = await this.findOpenBox(boxId);
    const itemIds = box.items.map((item) => item.inventoryItemId);
    const result = await this.outboundRepository.clearBoxItems(box.id, itemIds, operator.id);

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
    if (box.photos.length === 0) {
      throw new BadRequestException('Please upload a box photo before sealing.');
    }

    const sealed = await this.outboundRepository.sealBox({
      boxId: box.id,
      operatorId: operator.id,
    });
    return this.toBoxResponse(sealed);
  }

  async uploadPhoto(
    boxId: string,
    file: UploadedOutboundBoxPhotoFile | undefined,
    operator: AuthenticatedUser,
  ) {
    const box = await this.findOpenBox(boxId);
    const normalizedFile = this.validatePhotoFile(file);
    const extension = allowedPhotoMimeTypes.get(normalizedFile.mimetype) ?? '.jpg';
    const fileName = `${box.boxNo}-${randomUUID()}${extension}`;
    const storageDirectory = path.join(process.cwd(), outboundBoxPhotoDirectory);
    const storagePath = path.join(outboundBoxPhotoDirectory, fileName);
    const absolutePath = path.join(process.cwd(), storagePath);
    const fileUrl = `/uploads/outbound-box-photos/${fileName}`;

    await mkdir(storageDirectory, { recursive: true });
    await writeFile(absolutePath, normalizedFile.buffer);

    try {
      const updated = await this.outboundRepository.addPhotoToBox({
        boxId: box.id,
        operatorId: operator.id,
        fileName,
        originalName: normalizedFile.originalname,
        mimeType: normalizedFile.mimetype,
        fileSize: normalizedFile.size,
        storagePath,
        fileUrl,
      });
      return this.toBoxResponse(updated);
    } catch (error) {
      await this.deleteStoredFile(storagePath);
      throw error;
    }
  }

  async deletePhoto(boxId: string, photoId: string, operator: AuthenticatedUser) {
    const box = await this.findOpenBox(boxId);
    const photo = box.photos.find((item) => item.id === photoId);
    if (!photo) {
      throw new NotFoundException('Outbound box photo not found.');
    }

    const result = await this.outboundRepository.removePhotoFromBox({
      boxId: box.id,
      photoId,
      operatorId: operator.id,
    });
    await this.deleteStoredFile(result.photo.storagePath);

    return {
      deletedPhotoId: result.photo.id,
      box: this.toBoxResponse(result.box),
    };
  }

  async reopenBox(boxId: string, operator: AuthenticatedUser) {
    const box = await this.findExistingBox(boxId);
    if (box.status !== OutboundBoxStatus.SEALED) {
      throw new ConflictException('Only sealed outbound boxes can be reopened for rework.');
    }

    const reopened = await this.outboundRepository.reopenBox({
      boxId: box.id,
      operatorId: operator.id,
    });
    return this.toBoxResponse(reopened);
  }

  async deleteBox(boxId: string, operator: AuthenticatedUser) {
    const box = await this.findExistingBox(boxId);
    if (box.status === OutboundBoxStatus.SEALED) {
      throw new ConflictException('Sealed outbound boxes must be reopened before deletion.');
    }
    if (box.status === OutboundBoxStatus.VOIDED) {
      throw new ConflictException('Outbound box has already been deleted.');
    }

    const voided = await this.outboundRepository.voidBox({
      boxId: box.id,
      operatorId: operator.id,
    });
    return {
      deletedBoxId: voided.id,
      box: this.toBoxResponse(voided),
    };
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
      status: query.status ?? { not: OutboundBoxStatus.VOIDED },
      OR: search
        ? [
            { boxNo: { contains: search, mode: 'insensitive' } },
            { customer: { code: { contains: search, mode: 'insensitive' } } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
  }

  private toBoxResponse(box: OutboundBoxRecord | OutboundBoxListRecord) {
    const items = 'items' in box ? box.items : [];
    const itemCount = 'items' in box ? box.items.length : box._count.items;
    return {
      id: box.id,
      boxNo: box.boxNo,
      boxName: box.boxName,
      sizePreset: box.sizePreset,
      customSize: box.customSize,
      weightLb: box.weightLb,
      shippingTrackingNo: box.shippingTrackingNo,
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
      itemCount,
      items: items.map((item) => ({
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
      photos: box.photos.map((photo) => ({
        id: photo.id,
        fileName: photo.fileName,
        originalName: photo.originalName,
        mimeType: photo.mimeType,
        fileSize: photo.fileSize,
        fileUrl: photo.fileUrl,
        createdAt: photo.createdAt,
        uploadedBy: photo.uploadedBy,
      })),
      notes: box.notes,
      sealedAt: box.sealedAt,
      createdAt: box.createdAt,
      updatedAt: box.updatedAt,
    };
  }

  private async assertUniqueBoxName(
    warehouseId: string,
    boxName?: string | null,
    excludeBoxId?: string,
  ) {
    const normalizedBoxName = this.trimOptional(boxName);
    if (!normalizedBoxName) {
      return;
    }
    const existing = await this.outboundRepository.findBoxByName(
      warehouseId,
      normalizedBoxName,
      excludeBoxId,
    );
    if (existing) {
      throw new ConflictException('Outbound box name already exists in this warehouse.');
    }
  }

  private normalizeSizePreset(value?: string | null, fallback?: string) {
    const normalized = this.trimOptional(value)?.toUpperCase();
    if (!normalized) {
      return fallback;
    }
    return normalized;
  }

  private normalizeCustomSize(sizePreset?: string | null, customSize?: string | null) {
    const normalizedSizePreset = this.normalizeSizePreset(sizePreset);
    const normalizedCustomSize = this.trimOptional(customSize);
    if (normalizedSizePreset === 'CUSTOM' && !normalizedCustomSize) {
      throw new BadRequestException('customSize is required when sizePreset is CUSTOM.');
    }
    return normalizedSizePreset === 'CUSTOM' ? normalizedCustomSize : undefined;
  }

  private async generateBoxIdentity(params: {
    customerCode: string;
    customerName: string;
    warehouseId: string;
  }) {
    const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safeCustomerCode = params.customerCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const prefix = `BOX-${safeCustomerCode}-${dateKey}-`;
    const latestBox = await this.outboundRepository.findLatestBoxByPrefix(
      params.warehouseId,
      prefix,
    );
    const latestSequence = latestBox ? Number(latestBox.boxNo.slice(prefix.length)) : 0;
    const nextSequence = Number.isFinite(latestSequence) ? latestSequence + 1 : 1;

    return {
      boxNo: `${prefix}${nextSequence.toString().padStart(3, '0')}`,
      boxName: `${params.customerName.trim() || params.customerCode}${dateKey}箱${nextSequence}`,
    };
  }

  private trimOptional(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private validatePhotoFile(file: UploadedOutboundBoxPhotoFile | undefined) {
    if (!file) {
      throw new BadRequestException('photo file is required.');
    }
    if (!allowedPhotoMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        'Only JPG, PNG, WebP, MP4, MOV, or WebM files can be uploaded.',
      );
    }
    if (file.size > maxPhotoSizeBytes) {
      throw new BadRequestException('Packing evidence file must be 100 MB or smaller.');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('Uploaded photo is empty.');
    }

    return file;
  }

  private async deleteStoredFile(storagePath: string) {
    try {
      await unlink(path.join(process.cwd(), storagePath));
    } catch {
      // The database record is the source of truth; missing files should not block rework.
    }
  }
}
