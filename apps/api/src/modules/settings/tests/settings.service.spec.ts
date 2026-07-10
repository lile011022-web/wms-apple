/* global jest */
import { AuditAction } from '@prisma/client';
import { SettingsRepository } from '../settings.repository';
import { SettingsService } from '../settings.service';

const operator = {
  id: 'user-1',
  sessionId: 'session-test',
  email: 'admin@wms-scan.local',
  name: 'Admin',
  roles: ['ADMIN'],
  permissions: ['settings.manage'],
};

describe('SettingsService', () => {
  it('returns default scan, exception, notification, and retention settings when rows are missing', async () => {
    const settingsRepository = {
      findByKeys: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<SettingsRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new SettingsService(settingsRepository, auditLogsService as never);

    await expect(service.getSettings()).resolves.toEqual({
      warehouse: {
        defaultWarehouseId: '',
      },
      scanRules: {
        requiresLockedCustomer: true,
        enforceOutboundCustomerOwnership: true,
        detectDuplicateImei: true,
        detectDuplicateUps: true,
      },
      exceptionHandling: {
        createUnmatchedUpcException: true,
        createDuplicateImeiException: true,
        createDuplicateUpsException: true,
      },
      notifications: {
        exceptionEmailEnabled: false,
        reportExportEmailEnabled: false,
      },
      retention: {
        auditLogRetentionDays: 365,
        reportExportRetentionDays: 30,
        exceptionRecordRetentionDays: 730,
      },
    });
  });

  it('updates scan validation switches and writes a setting audit log', async () => {
    const settingsRepository = {
      findByKeys: jest.fn().mockResolvedValue([]),
      upsertMany: jest
        .fn()
        .mockResolvedValue([
          { key: 'scan.inbound.requiresLockedCustomer' },
          { key: 'scan.duplicateDetection.imei' },
        ]),
    } as unknown as jest.Mocked<SettingsRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new SettingsService(settingsRepository, auditLogsService as never);

    await service.updateSettings(
      {
        scanRules: {
          requiresLockedCustomer: false,
          detectDuplicateImei: false,
        },
      },
      operator,
    );

    expect(settingsRepository.upsertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'scan.inbound.requiresLockedCustomer',
          value: false,
          updatedById: 'user-1',
        }),
        expect.objectContaining({
          key: 'scan.duplicateDetection.imei',
          value: false,
          updatedById: 'user-1',
        }),
      ]),
    );
    expect(auditLogsService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'user-1',
        action: AuditAction.SYSTEM_SETTING_CHANGE,
        resourceType: 'system-settings',
        metadata: {
          changedKeys: ['scan.duplicateDetection.imei', 'scan.inbound.requiresLockedCustomer'],
        },
      }),
    );
  });

  it('rejects missing default warehouse references', async () => {
    const settingsRepository = {
      findWarehouseById: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<SettingsRepository>;
    const auditLogsService = { record: jest.fn() };
    const service = new SettingsService(settingsRepository, auditLogsService as never);

    await expect(
      service.updateSettings({ warehouse: { defaultWarehouseId: 'missing-warehouse' } }, operator),
    ).rejects.toThrow('Default warehouse not found.');
  });
});
