import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Boxes, ClipboardList } from 'lucide-react';
import type { ReactNode } from 'react';
import { auditLogsApi, dashboardApi } from '../../api/workflow';

export function DashboardPage() {
  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => dashboardApi.summary(),
  });
  const auditQuery = useQuery({
    queryKey: ['audit-logs-recent'],
    queryFn: () => auditLogsApi.recent(),
  });
  const summary = summaryQuery.data as DashboardSummary | undefined;
  const auditData = auditQuery.data as AuditLogItem[] | { items: AuditLogItem[] } | undefined;
  const auditLogs = Array.isArray(auditData) ? auditData : (auditData?.items ?? []);

  return (
    <section className="page-frame">
      <div className="page-heading">
        <p>WMS Scan</p>
        <h1>运营仪表盘</h1>
      </div>

      <div className="metric-grid">
        <MetricCard
          icon={<ClipboardList size={20} />}
          label="今日入库"
          value={summary?.todayInboundCount ?? 0}
        />
        <MetricCard
          icon={<Boxes size={20} />}
          label="今日封箱"
          value={summary?.todayOutboundBoxCount ?? 0}
        />
        <MetricCard
          icon={<Activity size={20} />}
          label="在库单件"
          value={summary?.inStockTotal ?? 0}
        />
        <MetricCard
          icon={<AlertTriangle size={20} />}
          label="待处理异常"
          value={summary?.pendingExceptionCount ?? 0}
        />
      </div>

      <section className="panel data-panel">
        <div className="section-title">
          <h2>最近操作</h2>
          <span>{summaryQuery.isLoading ? '正在读取' : (summary?.generatedAt ?? '')}</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>动作</th>
              <th>资源</th>
              <th>操作人</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((item) => (
              <tr key={item.id}>
                <td>{item.action}</td>
                <td>{item.resourceType}</td>
                <td>{item.operator?.name ?? 'System'}</td>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {auditLogs.length === 0 ? (
              <tr>
                <td colSpan={4}>暂无操作日志</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </section>
  );
}

type DashboardSummary = {
  todayInboundCount: number;
  todayOutboundBoxCount: number;
  inStockTotal: number;
  pendingExceptionCount: number;
  generatedAt: string;
};

type AuditLogItem = {
  id: string;
  action: string;
  resourceType: string;
  createdAt: string;
  operator?: { name: string } | null;
};

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <section className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}
