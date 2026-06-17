import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { allSettingDefinitions, settingDefinitions, SettingDefinition } from './settings.keys';
import { SettingsRepository } from './settings.repository';

type SettingsRecord = Awaited<ReturnType<SettingsRepository['findByKeys']>>[number];

@Injectable()
export class SettingsService {
  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async getSettings() {
    const records = await this.settingsRepository.findByKeys(
      allSettingDefinitions.map((definition) => definition.key),
    );

    return this.toGroupedSettings(records);
  }

  async updateSettings(dto: UpdateSettingsDto, operator: AuthenticatedUser) {
    const updateEntries = await this.toUpdateEntries(dto, operator.id);
    if (updateEntries.length === 0) {
      throw new BadRequestException('At least one setting field is required.');
    }

    const before = await this.getSettings();
    const records = await this.settingsRepository.upsertMany(updateEntries);
    const after = await this.getSettings();

    await this.auditLogsService.record({
      operatorId: operator.id,
      action: AuditAction.SYSTEM_SETTING_CHANGE,
      resourceType: 'system-settings',
      beforeSnapshot: before as Prisma.InputJsonValue,
      afterSnapshot: after as Prisma.InputJsonValue,
      metadata: {
        changedKeys: records.map((record) => record.key).sort(),
      },
    });

    return after;
  }

  private async toUpdateEntries(dto: UpdateSettingsDto, operatorId: string) {
    const entries: Array<{
      definition: SettingDefinition;
      value: Prisma.InputJsonValue;
    }> = [];

    if (dto.warehouse?.defaultWarehouseId !== undefined) {
      const warehouse = await this.settingsRepository.findWarehouseById(
        dto.warehouse.defaultWarehouseId,
      );
      if (!warehouse) {
        throw new NotFoundException('Default warehouse not found.');
      }
      entries.push({
        definition: settingDefinitions.warehouseDefaultId,
        value: dto.warehouse.defaultWarehouseId,
      });
    }

    this.pushIfDefined(
      entries,
      settingDefinitions.inboundRequiresLockedCustomer,
      dto.scanRules?.requiresLockedCustomer,
    );
    this.pushIfDefined(
      entries,
      settingDefinitions.outboundEnforceCustomerOwnership,
      dto.scanRules?.enforceOutboundCustomerOwnership,
    );
    this.pushIfDefined(
      entries,
      settingDefinitions.duplicateDetectImei,
      dto.scanRules?.detectDuplicateImei,
    );
    this.pushIfDefined(
      entries,
      settingDefinitions.duplicateDetectUps,
      dto.scanRules?.detectDuplicateUps,
    );
    this.pushIfDefined(
      entries,
      settingDefinitions.exceptionUnmatchedUpc,
      dto.exceptionHandling?.createUnmatchedUpcException,
    );
    this.pushIfDefined(
      entries,
      settingDefinitions.exceptionDuplicateImei,
      dto.exceptionHandling?.createDuplicateImeiException,
    );
    this.pushIfDefined(
      entries,
      settingDefinitions.exceptionDuplicateUps,
      dto.exceptionHandling?.createDuplicateUpsException,
    );
    this.pushIfDefined(
      entries,
      settingDefinitions.notificationExceptionEmail,
      dto.notifications?.exceptionEmailEnabled,
    );
    this.pushIfDefined(
      entries,
      settingDefinitions.notificationReportExportEmail,
      dto.notifications?.reportExportEmailEnabled,
    );
    this.pushIfDefined(
      entries,
      settingDefinitions.retentionAuditLogDays,
      dto.retention?.auditLogRetentionDays,
    );
    this.pushIfDefined(
      entries,
      settingDefinitions.retentionReportExportDays,
      dto.retention?.reportExportRetentionDays,
    );
    this.pushIfDefined(
      entries,
      settingDefinitions.retentionExceptionRecordDays,
      dto.retention?.exceptionRecordRetentionDays,
    );

    return entries.map((entry) => ({
      key: entry.definition.key,
      value: entry.value,
      valueType: entry.definition.valueType,
      description: entry.definition.description,
      updatedById: operatorId,
    }));
  }

  private pushIfDefined(
    entries: Array<{ definition: SettingDefinition; value: Prisma.InputJsonValue }>,
    definition: SettingDefinition,
    value: boolean | number | string | undefined,
  ) {
    if (value !== undefined) {
      entries.push({ definition, value });
    }
  }

  private toGroupedSettings(records: SettingsRecord[]) {
    const values = new Map(records.map((record) => [record.key, record.value]));
    const valueOf = <T extends boolean | number | string>(definition: SettingDefinition) =>
      (values.get(definition.key) ?? definition.defaultValue) as T;

    return {
      warehouse: {
        defaultWarehouseId: valueOf<string>(settingDefinitions.warehouseDefaultId),
      },
      scanRules: {
        requiresLockedCustomer: valueOf<boolean>(settingDefinitions.inboundRequiresLockedCustomer),
        enforceOutboundCustomerOwnership: valueOf<boolean>(
          settingDefinitions.outboundEnforceCustomerOwnership,
        ),
        detectDuplicateImei: valueOf<boolean>(settingDefinitions.duplicateDetectImei),
        detectDuplicateUps: valueOf<boolean>(settingDefinitions.duplicateDetectUps),
      },
      exceptionHandling: {
        createUnmatchedUpcException: valueOf<boolean>(settingDefinitions.exceptionUnmatchedUpc),
        createDuplicateImeiException: valueOf<boolean>(settingDefinitions.exceptionDuplicateImei),
        createDuplicateUpsException: valueOf<boolean>(settingDefinitions.exceptionDuplicateUps),
      },
      notifications: {
        exceptionEmailEnabled: valueOf<boolean>(settingDefinitions.notificationExceptionEmail),
        reportExportEmailEnabled: valueOf<boolean>(
          settingDefinitions.notificationReportExportEmail,
        ),
      },
      retention: {
        auditLogRetentionDays: valueOf<number>(settingDefinitions.retentionAuditLogDays),
        reportExportRetentionDays: valueOf<number>(settingDefinitions.retentionReportExportDays),
        exceptionRecordRetentionDays: valueOf<number>(
          settingDefinitions.retentionExceptionRecordDays,
        ),
      },
    };
  }
}
