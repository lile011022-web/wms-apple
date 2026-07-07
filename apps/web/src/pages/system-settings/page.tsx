import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { changePassword } from '../../api/auth';
import {
  getSystemSettings,
  listWarehouses,
  updateSystemSettings,
  type SystemSettings,
} from '../../api/settings';

export function SystemSettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['system-settings'],
    queryFn: getSystemSettings,
  });
  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ isActive: true }),
  });
  const [formValue, setFormValue] = useState<SystemSettings | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setFormValue(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: updateSystemSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(['system-settings'], settings);
      setFormValue(settings);
    },
  });
  const changePasswordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    },
  });

  const selectedWarehouseName = useMemo(() => {
    const warehouse = warehousesQuery.data?.find(
      (item) => item.id === formValue?.warehouse.defaultWarehouseId,
    );
    return warehouse ? `${warehouse.code} / ${warehouse.name}` : '未选择默认仓库';
  }, [formValue?.warehouse.defaultWarehouseId, warehousesQuery.data]);

  const handleBooleanChange =
    <TGroup extends keyof SystemSettings, TKey extends keyof SystemSettings[TGroup]>(
      group: TGroup,
      key: TKey,
    ) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;
      setFormValue((current) =>
        current
          ? {
              ...current,
              [group]: {
                ...current[group],
                [key]: checked,
              },
            }
          : current,
      );
    };

  const handleNumberChange =
    (key: keyof SystemSettings['retention']) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      setFormValue((current) =>
        current
          ? {
              ...current,
              retention: {
                ...current.retention,
                [key]: value,
              },
            }
          : current,
      );
    };

  const handleWarehouseChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setFormValue((current) =>
      current
        ? {
            ...current,
            warehouse: {
              ...current.warehouse,
              defaultWarehouseId: event.target.value,
            },
          }
        : current,
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (formValue) {
      saveMutation.mutate(formValue);
    }
  };

  const handlePasswordChange =
    (key: keyof typeof passwordForm) => (event: ChangeEvent<HTMLInputElement>) => {
      changePasswordMutation.reset();
      setPasswordForm((current) => ({
        ...current,
        [key]: event.target.value,
      }));
    };

  const handlePasswordSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    changePasswordMutation.mutate(passwordForm);
  };

  if (settingsQuery.isLoading) {
    return (
      <section className="page-frame">
        <PageHeading />
        <div className="panel">正在读取系统设置...</div>
      </section>
    );
  }

  if (settingsQuery.isError || !formValue) {
    return (
      <section className="page-frame">
        <PageHeading />
        <div className="panel error-panel">
          系统设置读取失败，请确认已登录且拥有 settings.manage 权限。
        </div>
      </section>
    );
  }

  return (
    <section className="page-frame settings-page">
      <PageHeading />

      <form className="settings-grid" onSubmit={handlePasswordSubmit}>
        <section className="panel settings-section settings-section-wide">
          <div className="section-title">
            <h2>账号安全</h2>
            <span>修改当前登录账号密码</span>
          </div>
          <label className="field-row">
            <span>当前密码</span>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={handlePasswordChange('currentPassword')}
              minLength={8}
              autoComplete="current-password"
            />
          </label>
          <label className="field-row">
            <span>新密码</span>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={handlePasswordChange('newPassword')}
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <label className="field-row">
            <span>确认新密码</span>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={handlePasswordChange('confirmPassword')}
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <div className="settings-actions">
            {changePasswordMutation.isError ? (
              <span className="save-error">
                {changePasswordMutation.error instanceof Error
                  ? changePasswordMutation.error.message
                  : '密码修改失败'}
              </span>
            ) : null}
            {changePasswordMutation.isSuccess ? (
              <span className="save-success">密码已修改</span>
            ) : null}
            <button type="submit" disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending ? '修改中' : '修改密码'}
            </button>
          </div>
        </section>
      </form>

      <form className="settings-grid" onSubmit={handleSubmit}>
        <section className="panel settings-section">
          <div className="section-title">
            <h2>Warehouse</h2>
            <span>{selectedWarehouseName}</span>
          </div>
          <label className="field-row">
            <span>Default warehouse</span>
            <select
              value={formValue.warehouse.defaultWarehouseId}
              onChange={handleWarehouseChange}
              disabled={warehousesQuery.isLoading}
            >
              <option value="">Select warehouse</option>
              {warehousesQuery.data?.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} / {warehouse.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="panel settings-section">
          <div className="section-title">
            <h2>Scan Rules</h2>
          </div>
          <Toggle
            label="Inbound must lock customer"
            checked={formValue.scanRules.requiresLockedCustomer}
            onChange={handleBooleanChange('scanRules', 'requiresLockedCustomer')}
          />
          <Toggle
            label="Outbound enforces customer ownership"
            checked={formValue.scanRules.enforceOutboundCustomerOwnership}
            onChange={handleBooleanChange('scanRules', 'enforceOutboundCustomerOwnership')}
          />
          <Toggle
            label="Detect duplicate IMEI"
            checked={formValue.scanRules.detectDuplicateImei}
            onChange={handleBooleanChange('scanRules', 'detectDuplicateImei')}
          />
          <Toggle
            label="Detect duplicate UPS"
            checked={formValue.scanRules.detectDuplicateUps}
            onChange={handleBooleanChange('scanRules', 'detectDuplicateUps')}
          />
        </section>

        <section className="panel settings-section">
          <div className="section-title">
            <h2>Exception Handling</h2>
          </div>
          <Toggle
            label="Create unmatched UPC exception"
            checked={formValue.exceptionHandling.createUnmatchedUpcException}
            onChange={handleBooleanChange('exceptionHandling', 'createUnmatchedUpcException')}
          />
          <Toggle
            label="Create duplicate IMEI exception"
            checked={formValue.exceptionHandling.createDuplicateImeiException}
            onChange={handleBooleanChange('exceptionHandling', 'createDuplicateImeiException')}
          />
          <Toggle
            label="Create duplicate UPS exception"
            checked={formValue.exceptionHandling.createDuplicateUpsException}
            onChange={handleBooleanChange('exceptionHandling', 'createDuplicateUpsException')}
          />
        </section>

        <section className="panel settings-section">
          <div className="section-title">
            <h2>Notifications</h2>
          </div>
          <Toggle
            label="Exception email"
            checked={formValue.notifications.exceptionEmailEnabled}
            onChange={handleBooleanChange('notifications', 'exceptionEmailEnabled')}
          />
          <Toggle
            label="Report export email"
            checked={formValue.notifications.reportExportEmailEnabled}
            onChange={handleBooleanChange('notifications', 'reportExportEmailEnabled')}
          />
        </section>

        <section className="panel settings-section">
          <div className="section-title">
            <h2>Retention</h2>
          </div>
          <NumberField
            label="Audit logs"
            value={formValue.retention.auditLogRetentionDays}
            onChange={handleNumberChange('auditLogRetentionDays')}
          />
          <NumberField
            label="Report exports"
            value={formValue.retention.reportExportRetentionDays}
            onChange={handleNumberChange('reportExportRetentionDays')}
          />
          <NumberField
            label="Exception records"
            value={formValue.retention.exceptionRecordRetentionDays}
            onChange={handleNumberChange('exceptionRecordRetentionDays')}
          />
        </section>

        <div className="settings-actions">
          {saveMutation.isError ? (
            <span className="save-error">保存失败，请检查权限或字段范围。</span>
          ) : null}
          {saveMutation.isSuccess ? <span className="save-success">已保存</span> : null}
          <button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </form>
    </section>
  );
}

function PageHeading() {
  return (
    <header className="page-heading">
      <p>System Settings</p>
      <h1>系统设置</h1>
    </header>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <input type="number" min={1} max={3650} value={value} onChange={onChange} />
    </label>
  );
}
