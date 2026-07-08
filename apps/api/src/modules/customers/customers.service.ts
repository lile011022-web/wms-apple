import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, CustomerStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CustomersRepository } from './customers.repository';
import { CreateCustomerAliasDto } from './dto/create-customer-alias.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomerAliasOptionsQueryDto } from './dto/list-customer-alias-options-query.dto';
import { ListCustomerOptionsQueryDto } from './dto/list-customer-options-query.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { UpdateCustomerAliasDto } from './dto/update-customer-alias.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

type CustomerRecord = NonNullable<Awaited<ReturnType<CustomersRepository['findById']>>>;
type CustomerAliasRecord = NonNullable<Awaited<ReturnType<CustomersRepository['findAliasById']>>>;

@Injectable()
export class CustomersService {
  constructor(
    private readonly customersRepository: CustomersRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async list(query: ListCustomersQueryDto) {
    const allowedSortFields = new Set(['createdAt', 'updatedAt', 'code', 'name', 'status']);
    const sortBy = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'createdAt';
    const [total, customers] = await this.customersRepository.findMany({
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      search: query.search,
      status: query.status,
      orderBy: { [sortBy]: query.sortOrder } as Prisma.CustomerOrderByWithRelationInput,
    });
    const monthStart = this.getCurrentMonthStart();
    const items = await Promise.all(
      customers.map(async (customer) => ({
        ...this.toCustomerResponse(customer),
        summary: await this.customersRepository.getSummary(customer.id, monthStart),
      })),
    );

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async options(query: ListCustomerOptionsQueryDto) {
    const customers = await this.customersRepository.findOptions(query);
    return customers.map((customer) => ({
      id: customer.id,
      code: customer.code,
      name: customer.name,
      status: customer.status,
      label: `${customer.code} - ${customer.name}`,
      disabled: customer.status !== CustomerStatus.ACTIVE,
    }));
  }

  async aliasOptions(query: ListCustomerAliasOptionsQueryDto) {
    const aliases = await this.customersRepository.findAliasOptions({
      customerId: this.trimOptional(query.customerId),
      search: this.trimOptional(query.search),
      includeInactive: query.includeInactive,
    });
    return aliases.map((alias) => ({
      id: alias.id,
      customerId: alias.customerId,
      code: alias.code,
      name: alias.name,
      status: alias.status,
      label: `${alias.customer.code} - ${alias.customer.name} / ${alias.code} - ${alias.name}`,
      disabled:
        alias.status !== CustomerStatus.ACTIVE || alias.customer.status !== CustomerStatus.ACTIVE,
      customer: alias.customer,
    }));
  }

  async getById(id: string) {
    const customer = await this.findExistingCustomer(id);
    return this.toCustomerResponse(customer);
  }

  async getSummary(id: string) {
    await this.findExistingCustomer(id);
    return this.customersRepository.getSummary(id, this.getCurrentMonthStart());
  }

  async listAliases(customerId: string) {
    await this.findExistingCustomer(customerId);
    const aliases = await this.customersRepository.findAliasesByCustomerId(customerId);
    return aliases.map((alias) => this.toAliasResponse(alias));
  }

  async createAlias(customerId: string, dto: CreateCustomerAliasDto, operator: AuthenticatedUser) {
    await this.findExistingCustomer(customerId);
    const code = this.normalizeCode(dto.code);
    const existingAlias = await this.customersRepository.findAliasByCustomerAndCode(
      customerId,
      code,
    );
    if (existingAlias) {
      throw new ConflictException('Customer alias code already exists under this customer.');
    }

    const alias = await this.customersRepository.createAlias({
      customer: { connect: { id: customerId } },
      code,
      name: dto.name.trim(),
      status: dto.status ?? CustomerStatus.ACTIVE,
      notes: this.trimOptional(dto.notes),
    });

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.CUSTOMER_CHANGE,
      resourceType: 'customer-alias',
      resourceId: alias.id,
      afterSnapshot: this.toAliasAuditSnapshot(alias),
      metadata: {
        customerId,
      },
    });

    return this.toAliasResponse(alias);
  }

  async updateAlias(
    customerId: string,
    aliasId: string,
    dto: UpdateCustomerAliasDto,
    operator: AuthenticatedUser,
  ) {
    const before = await this.findExistingAlias(customerId, aliasId);
    const code = dto.code ? this.normalizeCode(dto.code) : undefined;
    if (code && code !== before.code) {
      const existingAlias = await this.customersRepository.findAliasByCustomerAndCode(
        customerId,
        code,
      );
      if (existingAlias) {
        throw new ConflictException('Customer alias code already exists under this customer.');
      }
    }

    const after = await this.customersRepository.updateAlias(aliasId, {
      code,
      name: dto.name?.trim(),
      notes: dto.notes === undefined ? undefined : this.trimOptional(dto.notes),
    });

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.CUSTOMER_CHANGE,
      resourceType: 'customer-alias',
      resourceId: after.id,
      beforeSnapshot: this.toAliasAuditSnapshot(before),
      afterSnapshot: this.toAliasAuditSnapshot(after),
      metadata: {
        customerId,
      },
    });

    return this.toAliasResponse(after);
  }

  async updateAliasStatus(
    customerId: string,
    aliasId: string,
    dto: UpdateCustomerStatusDto,
    operator: AuthenticatedUser,
  ) {
    const before = await this.findExistingAlias(customerId, aliasId);
    const after = await this.customersRepository.updateAlias(aliasId, {
      status: dto.status,
    });

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.CUSTOMER_CHANGE,
      resourceType: 'customer-alias',
      resourceId: after.id,
      beforeSnapshot: this.toAliasAuditSnapshot(before),
      afterSnapshot: this.toAliasAuditSnapshot(after),
      metadata: {
        customerId,
        changedFields: ['status'],
      },
    });

    return this.toAliasResponse(after);
  }

  async create(dto: CreateCustomerDto, operator: AuthenticatedUser) {
    const code = this.normalizeCode(dto.code);
    const existingCustomer = await this.customersRepository.findByCode(code);
    if (existingCustomer) {
      throw new ConflictException('Customer code already exists.');
    }

    const customer = await this.customersRepository.create({
      code,
      name: dto.name.trim(),
      contactName: this.trimOptional(dto.contactName),
      contactInfo: this.trimOptional(dto.contactInfo),
      status: dto.status ?? CustomerStatus.ACTIVE,
      notes: this.trimOptional(dto.notes),
    });

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.CUSTOMER_CHANGE,
      resourceType: 'customer',
      resourceId: customer.id,
      afterSnapshot: this.toAuditSnapshot(customer),
    });

    return this.toCustomerResponse(customer);
  }

  async update(id: string, dto: UpdateCustomerDto, operator: AuthenticatedUser) {
    const before = await this.findExistingCustomer(id);
    const code = dto.code ? this.normalizeCode(dto.code) : undefined;
    if (code && code !== before.code) {
      const existingCustomer = await this.customersRepository.findByCode(code);
      if (existingCustomer) {
        throw new ConflictException('Customer code already exists.');
      }
    }

    const after = await this.customersRepository.update(id, {
      code,
      name: dto.name?.trim(),
      contactName: dto.contactName === undefined ? undefined : this.trimOptional(dto.contactName),
      contactInfo: dto.contactInfo === undefined ? undefined : this.trimOptional(dto.contactInfo),
      notes: dto.notes === undefined ? undefined : this.trimOptional(dto.notes),
    });

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.CUSTOMER_CHANGE,
      resourceType: 'customer',
      resourceId: after.id,
      beforeSnapshot: this.toAuditSnapshot(before),
      afterSnapshot: this.toAuditSnapshot(after),
    });

    return this.toCustomerResponse(after);
  }

  async updateStatus(id: string, dto: UpdateCustomerStatusDto, operator: AuthenticatedUser) {
    const before = await this.findExistingCustomer(id);
    const after = await this.customersRepository.update(id, {
      status: dto.status,
    });

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.CUSTOMER_CHANGE,
      resourceType: 'customer',
      resourceId: after.id,
      beforeSnapshot: this.toAuditSnapshot(before),
      afterSnapshot: this.toAuditSnapshot(after),
      metadata: {
        changedFields: ['status'],
      },
    });

    return this.toCustomerResponse(after);
  }

  private async findExistingCustomer(id: string) {
    const customer = await this.customersRepository.findById(id);
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }
    return customer;
  }

  private async findExistingAlias(customerId: string, aliasId: string) {
    const alias = await this.customersRepository.findAliasById(aliasId);
    if (!alias || alias.customerId !== customerId) {
      throw new NotFoundException('Customer alias not found.');
    }
    return alias;
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
  }

  private trimOptional(value?: string) {
    const trimmed = value?.trim();
    return trimmed || undefined;
  }

  private getCurrentMonthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  private toCustomerResponse(customer: CustomerRecord) {
    return {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      contactName: customer.contactName,
      contactInfo: customer.contactInfo,
      status: customer.status,
      notes: customer.notes,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  private toAuditSnapshot(customer: CustomerRecord) {
    return this.toCustomerResponse(customer);
  }

  private toAliasResponse(
    alias:
      | CustomerAliasRecord
      | Awaited<ReturnType<CustomersRepository['findAliasesByCustomerId']>>[number],
  ) {
    return {
      id: alias.id,
      customerId: alias.customerId,
      code: alias.code,
      name: alias.name,
      status: alias.status,
      notes: alias.notes,
      createdAt: alias.createdAt,
      updatedAt: alias.updatedAt,
    };
  }

  private toAliasAuditSnapshot(alias: CustomerAliasRecord) {
    return this.toAliasResponse(alias);
  }
}
