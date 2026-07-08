import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { packagePrealertsApi } from '../../api/workflow';

export function PackageAlertsPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const alertsQuery = useQuery({
    queryKey: ['package-alerts'],
    queryFn: () => packagePrealertsApi.alerts({ page: 1, pageSize: 80 }),
  });
  const result = alertsQuery.data as PackageAlertResult | undefined;

  const handleMutation = useMutation({
    mutationFn: (input: { id: string; status: string; note: string }) =>
      packagePrealertsApi.handleAlert(input.id, {
        status: input.status,
        resolutionNote: input.note,
      }),
    onSuccess: () => {
      setMessage('预警状态已更新');
      setErrorMessage('');
      void queryClient.invalidateQueries({ queryKey: ['package-alerts'] });
      void queryClient.invalidateQueries({ queryKey: ['package-prealerts'] });
      void queryClient.invalidateQueries({ queryKey: ['package-prealert-summary'] });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '处理预警失败')),
  });

  return (
    <section className="page-frame">
      <div className="page-heading">
        <p>Package Alerts</p>
        <h1>包裹预警</h1>
      </div>

      <section className="panel data-panel">
        <div className="section-title">
          <h2>风险包裹</h2>
          <span>共 {result?.total ?? 0} 条</span>
        </div>
        <button type="button" className="icon-button" onClick={() => void alertsQuery.refetch()}>
          <RefreshCw size={16} />
          刷新
        </button>
        {message ? <div className="inline-success">{message}</div> : null}
        {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}
        <table className="data-table">
          <thead>
            <tr>
              <th>风险</th>
              <th>客户</th>
              <th>物流单号</th>
              <th>物流状态</th>
              <th>预计到达</th>
              <th>实际送达</th>
              <th>触发时间</th>
              <th>处理</th>
            </tr>
          </thead>
          <tbody>
            {result?.items.map((alert) => (
              <tr key={alert.id}>
                <td>
                  <div
                    className={`status-pill ${alert.severity === 'CRITICAL' ? 'danger' : 'warning'}`}
                  >
                    <ShieldAlert size={14} />
                    {alertLabel(alert.alertType)}
                  </div>
                </td>
                <td>{alert.prealert.customer.code}</td>
                <td className="mono">{alert.prealert.trackingNo}</td>
                <td>{statusLabel(alert.prealert.logisticsStatus)}</td>
                <td>{formatDateTime(alert.prealert.estimatedArrivalAt)}</td>
                <td>{formatDateTime(alert.prealert.deliveredAt)}</td>
                <td>{formatDateTime(alert.triggeredAt)}</td>
                <td>
                  <div className="customer-row-actions">
                    <button
                      type="button"
                      className="table-action secondary"
                      onClick={() =>
                        handleMutation.mutate({
                          id: alert.id,
                          status: 'IN_PROGRESS',
                          note: '已开始处理。',
                        })
                      }
                    >
                      处理中
                    </button>
                    <button
                      type="button"
                      className="table-action"
                      onClick={() =>
                        handleMutation.mutate({
                          id: alert.id,
                          status: 'RESOLVED',
                          note: '已处理完成。',
                        })
                      }
                    >
                      <CheckCircle2 size={14} />
                      已解决
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!result || result.items.length === 0 ? (
              <tr>
                <td colSpan={8}>暂无包裹预警</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </section>
  );
}

function alertLabel(type: string) {
  const labels: Record<string, string> = {
    DELIVERED_NOT_RECEIVED: '已送达但未扫码',
    ETA_OVERDUE: 'ETA 已过',
    STALE_TRACKING: '长时间未更新',
    DUPLICATE_PREALERT: '重复预报',
    CUSTOMER_CONFLICT: '客户冲突',
    SYNC_FAILED: '同步失败',
    UNPREALERTED_INBOUND: '未预报入库',
  };
  return labels[type] ?? type;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    UNKNOWN: '未知',
    IN_TRANSIT: '运输中',
    OUT_FOR_DELIVERY: '派送中',
    DELIVERED: '已送达',
    EXCEPTION: '物流异常',
  };
  return labels[status] ?? status;
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function toUserErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

type PackageAlertResult = { items: PackageAlert[]; total: number };
type PackageAlert = {
  id: string;
  alertType: string;
  severity: string;
  triggeredAt: string;
  prealert: {
    customer: { code: string };
    trackingNo: string;
    logisticsStatus: string;
    estimatedArrivalAt?: string | null;
    deliveredAt?: string | null;
  };
};
