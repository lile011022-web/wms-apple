import { SettingValueType } from '@prisma/client';

export type SettingDefinition = {
  key: string;
  valueType: SettingValueType;
  defaultValue: boolean | number | string;
  description: string;
};

export const settingDefinitions = {
  warehouseDefaultId: {
    key: 'warehouse.defaultId',
    valueType: SettingValueType.STRING,
    defaultValue: '',
    description: 'Default warehouse used by inbound, inventory, and outbound workflows.',
  },
  inboundRequiresLockedCustomer: {
    key: 'scan.inbound.requiresLockedCustomer',
    valueType: SettingValueType.BOOLEAN,
    defaultValue: true,
    description:
      'Inbound scanning must lock a customer before accepting UPS, UPC, IMEI, or Serial scans.',
  },
  outboundEnforceCustomerOwnership: {
    key: 'scan.outbound.enforceCustomerOwnership',
    valueType: SettingValueType.BOOLEAN,
    defaultValue: true,
    description: 'Outbound packing can only select inventory that belongs to the locked customer.',
  },
  duplicateDetectImei: {
    key: 'scan.duplicateDetection.imei',
    valueType: SettingValueType.BOOLEAN,
    defaultValue: true,
    description: 'Detect duplicated IMEI values during inbound scanning and confirmation.',
  },
  duplicateDetectUps: {
    key: 'scan.duplicateDetection.ups',
    valueType: SettingValueType.BOOLEAN,
    defaultValue: true,
    description: 'Detect duplicated UPS tracking numbers during inbound scanning and confirmation.',
  },
  exceptionUnmatchedUpc: {
    key: 'exceptions.autoCreateForUnmatchedUpc',
    valueType: SettingValueType.BOOLEAN,
    defaultValue: true,
    description:
      'Create an exception record when an inbound UPC cannot be matched to the product library.',
  },
  exceptionDuplicateImei: {
    key: 'exceptions.autoCreateForDuplicateImei',
    valueType: SettingValueType.BOOLEAN,
    defaultValue: true,
    description: 'Create an exception record when a duplicated IMEI is detected.',
  },
  exceptionDuplicateUps: {
    key: 'exceptions.autoCreateForDuplicateUps',
    valueType: SettingValueType.BOOLEAN,
    defaultValue: true,
    description: 'Create an exception record when a duplicated UPS tracking number is detected.',
  },
  notificationExceptionEmail: {
    key: 'notifications.exceptionEmailEnabled',
    valueType: SettingValueType.BOOLEAN,
    defaultValue: false,
    description: 'Send email notifications for newly created exception records when enabled.',
  },
  notificationReportExportEmail: {
    key: 'notifications.reportExportEmailEnabled',
    valueType: SettingValueType.BOOLEAN,
    defaultValue: false,
    description: 'Send email notifications when report export jobs complete or fail.',
  },
  retentionAuditLogDays: {
    key: 'retention.auditLogDays',
    valueType: SettingValueType.NUMBER,
    defaultValue: 365,
    description: 'Number of days to retain audit log records.',
  },
  retentionReportExportDays: {
    key: 'retention.reportExportDays',
    valueType: SettingValueType.NUMBER,
    defaultValue: 30,
    description: 'Number of days to retain generated report export files and history.',
  },
  retentionExceptionRecordDays: {
    key: 'retention.exceptionRecordDays',
    valueType: SettingValueType.NUMBER,
    defaultValue: 730,
    description: 'Number of days to retain exception records.',
  },
} satisfies Record<string, SettingDefinition>;

export const allSettingDefinitions = Object.values(settingDefinitions);
