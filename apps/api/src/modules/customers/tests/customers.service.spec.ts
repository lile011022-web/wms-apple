/* global jest */
import { AuditAction, CustomerStatus } from '@prisma/client';
import { CustomersRepository } from '../customers.repository';
import { CustomersService } from '../customers.service';

const operator = {
  id: 'user-1',
  sessionId: 'session-test',
  email: 'admin@wms-scan.local',
  name: 'Admin',
  roles: ['ADMIN'],
  permissions: ['customers.manage'],
};

const customer = {
  id: 'customer-1',
  code: 'CUST-001',
  name: 'TechFlow Inc.',
  contactName: 'John Smith',
  contactInfo: 'john@techflow.com',
  status: CustomerStatus.ACTIVE,
  notes: null,
  createdAt: new Date('2026-06-17T00:00:00Z'),
  updatedAt: new Date('2026-06-17T00:00:00Z'),
};

describe('CustomersService', () => {
  it('normalizes customer code and writes audit log on create', async () => {
    const customersRepository = {
      findByCode: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(customer),
    } as unknown as jest.Mocked<CustomersRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new CustomersService(customersRepository, auditLogsService as never);

    await expect(
      service.create(
        {
          code: ' cust-001 ',
          name: 'TechFlow Inc.',
          contactName: ' John Smith ',
        },
        operator,
      ),
    ).resolves.toMatchObject({
      id: 'customer-1',
      code: 'CUST-001',
      status: CustomerStatus.ACTIVE,
    });

    expect(customersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CUST-001',
        contactName: 'John Smith',
        status: CustomerStatus.ACTIVE,
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'user-1',
        action: AuditAction.CUSTOMER_CHANGE,
        resourceType: 'customer',
        resourceId: 'customer-1',
      }),
    );
  });

  it('returns active customer options by default and marks inactive options disabled', async () => {
    const customersRepository = {
      findOptions: jest.fn().mockResolvedValue([
        {
          id: 'customer-2',
          code: 'CUST-002',
          name: 'OldTech Trading',
          status: CustomerStatus.INACTIVE,
        },
      ]),
    } as unknown as jest.Mocked<CustomersRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new CustomersService(customersRepository, auditLogsService as never);

    await expect(service.options({ includeInactive: true })).resolves.toEqual([
      {
        id: 'customer-2',
        code: 'CUST-002',
        name: 'OldTech Trading',
        status: CustomerStatus.INACTIVE,
        label: 'CUST-002 - OldTech Trading',
        disabled: true,
      },
    ]);
  });

  it('writes audit log when customer status changes', async () => {
    const inactiveCustomer = {
      ...customer,
      status: CustomerStatus.INACTIVE,
    };
    const customersRepository = {
      findById: jest.fn().mockResolvedValue(customer),
      update: jest.fn().mockResolvedValue(inactiveCustomer),
    } as unknown as jest.Mocked<CustomersRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new CustomersService(customersRepository, auditLogsService as never);

    await expect(
      service.updateStatus('customer-1', { status: CustomerStatus.INACTIVE }, operator),
    ).resolves.toMatchObject({
      id: 'customer-1',
      status: CustomerStatus.INACTIVE,
    });

    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CUSTOMER_CHANGE,
        beforeSnapshot: expect.objectContaining({ status: CustomerStatus.ACTIVE }),
        afterSnapshot: expect.objectContaining({ status: CustomerStatus.INACTIVE }),
      }),
    );
  });
});
