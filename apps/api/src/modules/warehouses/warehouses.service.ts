import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { ListWarehousesQueryDto } from './dto/list-warehouses-query.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehousesRepository } from './warehouses.repository';

type WarehouseRecord = NonNullable<Awaited<ReturnType<WarehousesRepository['findById']>>>;

@Injectable()
export class WarehousesService {
  constructor(
    private readonly warehousesRepository: WarehousesRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async list(query: ListWarehousesQueryDto) {
    const warehouses = await this.warehousesRepository.findMany(query);
    return warehouses.map((warehouse) => this.toWarehouseResponse(warehouse));
  }

  async create(dto: CreateWarehouseDto, operator: AuthenticatedUser) {
    const code = this.normalizeCode(dto.code);
    const existingWarehouse = await this.warehousesRepository.findByCode(code);
    if (existingWarehouse) {
      throw new ConflictException('Warehouse code already exists.');
    }

    const warehouse = await this.warehousesRepository.create({
      code,
      name: dto.name.trim(),
      address: dto.address?.trim(),
      timezone: dto.timezone?.trim() ?? 'America/Los_Angeles',
      isActive: dto.isActive ?? true,
    });

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.SYSTEM_SETTING_CHANGE,
      resourceType: 'warehouse',
      resourceId: warehouse.id,
      afterSnapshot: this.toAuditSnapshot(warehouse),
    });

    return this.toWarehouseResponse(warehouse);
  }

  async update(id: string, dto: UpdateWarehouseDto, operator: AuthenticatedUser) {
    const before = await this.warehousesRepository.findById(id);
    if (!before) {
      throw new NotFoundException('Warehouse not found.');
    }

    const code = dto.code ? this.normalizeCode(dto.code) : undefined;
    if (code && code !== before.code) {
      const existingWarehouse = await this.warehousesRepository.findByCode(code);
      if (existingWarehouse) {
        throw new ConflictException('Warehouse code already exists.');
      }
    }

    const after = await this.warehousesRepository.update(id, {
      code,
      name: dto.name?.trim(),
      address: dto.address?.trim(),
      timezone: dto.timezone?.trim(),
      isActive: dto.isActive,
    });

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.SYSTEM_SETTING_CHANGE,
      resourceType: 'warehouse',
      resourceId: after.id,
      beforeSnapshot: this.toAuditSnapshot(before),
      afterSnapshot: this.toAuditSnapshot(after),
    });

    return this.toWarehouseResponse(after);
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private toWarehouseResponse(warehouse: WarehouseRecord) {
    return {
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      address: warehouse.address,
      timezone: warehouse.timezone,
      isActive: warehouse.isActive,
      createdAt: warehouse.createdAt,
      updatedAt: warehouse.updatedAt,
    };
  }

  private toAuditSnapshot(warehouse: WarehouseRecord) {
    return this.toWarehouseResponse(warehouse);
  }
}
