/* global jest */
import { AuditAction } from '@prisma/client';
import { WarehousesRepository } from '../warehouses.repository';
import { WarehousesService } from '../warehouses.service';

const operator = {
  id: 'user-1',
  sessionId: 'session-test',
  email: 'admin@wms-scan.local',
  name: 'Admin',
  roles: ['ADMIN'],
  permissions: ['settings.manage'],
};

const warehouse = {
  id: 'warehouse-1',
  code: 'US-LAX-01',
  name: 'US Los Angeles Warehouse',
  address: null,
  timezone: 'America/Los_Angeles',
  isActive: true,
  createdAt: new Date('2026-06-17T00:00:00Z'),
  updatedAt: new Date('2026-06-17T00:00:00Z'),
};

describe('WarehousesService', () => {
  it('normalizes warehouse code and writes audit log on create', async () => {
    const warehousesRepository = {
      findByCode: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(warehouse),
    } as unknown as jest.Mocked<WarehousesRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new WarehousesService(warehousesRepository, auditLogsService as never);

    await expect(
      service.create(
        {
          code: ' us-lax-01 ',
          name: 'US Los Angeles Warehouse',
        },
        operator,
      ),
    ).resolves.toMatchObject({
      id: 'warehouse-1',
      code: 'US-LAX-01',
      isActive: true,
    });

    expect(warehousesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'US-LAX-01',
        timezone: 'America/Los_Angeles',
        isActive: true,
      }),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'user-1',
        action: AuditAction.SYSTEM_SETTING_CHANGE,
        resourceType: 'warehouse',
        resourceId: 'warehouse-1',
      }),
    );
  });
});
