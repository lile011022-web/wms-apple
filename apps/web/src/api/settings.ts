import { request } from './client';

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SystemSettings = {
  warehouse: {
    defaultWarehouseId: string;
  };
  scanRules: {
    requiresLockedCustomer: boolean;
    enforceOutboundCustomerOwnership: boolean;
    detectDuplicateImei: boolean;
    detectDuplicateUps: boolean;
  };
  exceptionHandling: {
    createUnmatchedUpcException: boolean;
    createDuplicateImeiException: boolean;
    createDuplicateUpsException: boolean;
  };
  notifications: {
    exceptionEmailEnabled: boolean;
    reportExportEmailEnabled: boolean;
  };
  retention: {
    auditLogRetentionDays: number;
    reportExportRetentionDays: number;
    exceptionRecordRetentionDays: number;
  };
};

export type UpdateSystemSettings = Partial<{
  warehouse: Partial<SystemSettings['warehouse']>;
  scanRules: Partial<SystemSettings['scanRules']>;
  exceptionHandling: Partial<SystemSettings['exceptionHandling']>;
  notifications: Partial<SystemSettings['notifications']>;
  retention: Partial<SystemSettings['retention']>;
}>;

export function listWarehouses(params?: { search?: string; isActive?: boolean }) {
  return request<Warehouse[]>('get', '/warehouses', { params });
}

export function getSystemSettings() {
  return request<SystemSettings>('get', '/settings');
}

export function updateSystemSettings(data: UpdateSystemSettings) {
  return request<SystemSettings>('patch', '/settings', { data });
}
