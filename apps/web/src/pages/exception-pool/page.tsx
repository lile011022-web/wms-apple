import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw, ShieldX, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { customersApi, exceptionsApi } from '../../api/workflow';

export function ExceptionPoolPage() {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [selected, setSelected] = useState<ExceptionItem | null>(null);
  const [resolutionNote, setResolutionNote] = useState('本地联调确认处理。');
  const [message, setMessage] = useState('');

  const customersQuery = useQuery({
    queryKey: ['customer-options'],
    queryFn: () => customersApi.options(),
  });
  const customers = (customersQuery.data as CustomerOption[] | undefined) ?? [];

  const params = useMemo(
    () => ({
      page: 1,
      pageSize: 50,
      customerId: customerId || undefined,
      type: type || undefined,
      status: status || undefined,
    }),
    [customerId, status, type],
  );

  const summaryQuery = useQuery({
    queryKey: ['exceptions-summary'],
    queryFn: () => exceptionsApi.summary(),
  });
  const listQuery = useQuery({
    queryKey: ['exceptions', params],
    queryFn: () => exceptionsApi.list(params),
  });
  const summary = summaryQuery.data as ExceptionSummary | undefined;
  const result = listQuery.data as ExceptionResult | undefined;

  const handleSuccess = async (text: string) => {
    setMessage(text);
    setSelected(null);
    await queryClient.invalidateQueries({ queryKey: ['exceptions'] });
    await queryClient.invalidateQueries({ queryKey: ['exceptions-summary'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  };

  const resolveMutation = useMutation({
    mutationFn: (id: string) => exceptionsApi.resolve(id, { resolutionNote }),
    onSuccess: () => handleSuccess('异常已处理'),
  });
  const ignoreMutation = useMutation({
    mutationFn: (id: string) => exceptionsApi.ignore(id, { resolutionNote }),
    onSuccess: () => handleSuccess('异常已忽略'),
  });
  const invalidateMutation = useMutation({
    mutationFn: (id: string) => exceptionsApi.invalidate(id, { resolutionNote }),
    onSuccess: () => handleSuccess('异常已标记无效'),
  });

  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <p>Exception</p>
          <h1>异常池</h1>
        </div>
        <button type="button" className="btn secondary" onClick={() => listQuery.refetch()}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>

      <div className="metric-grid">
        <Metric label="待处理" value={summary?.open ?? summary?.OPEN ?? 0} intent="warning" />
        <Metric
          label="已处理"
          value={summary?.resolved ?? summary?.RESOLVED ?? 0}
          intent="success"
        />
        <Metric label="已忽略" value={summary?.ignored ?? summary?.IGNORED ?? 0} intent="info" />
        <Metric label="无效" value={summary?.invalid ?? summary?.INVALID ?? 0} intent="danger" />
      </div>

      <section className="panel filter-grid">
        <label>
          <span>客户</span>
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">全部客户</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>异常类型</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">全部类型</option>
            <option value="UPC_NOT_MATCHED">UPC 未匹配</option>
            <option value="IMEI_DUPLICATED">IMEI 重复</option>
            <option value="UPS_DUPLICATED">UPS 重复</option>
            <option value="CUSTOMER_MISMATCH">客户归属错误</option>
            <option value="OUTBOUND_CUSTOMER_MISMATCH">出库客户不一致</option>
          </select>
        </label>
        <label>
          <span>状态</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="OPEN">待处理</option>
            <option value="RESOLVED">已处理</option>
            <option value="IGNORED">已忽略</option>
            <option value="INVALID">无效</option>
            <option value="">全部</option>
          </select>
        </label>
      </section>

      {message ? <div className="inline-success">{message}</div> : null}

      <div className="grid-2">
        <section className="panel data-panel">
          <div className="section-title">
            <h2>异常列表</h2>
            <span>共 {result?.total ?? 0} 条</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>客户</th>
                <th>值</th>
                <th>状态</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {result?.items.map((item) => (
                <tr key={item.id} onClick={() => setSelected(item)}>
                  <td>{item.type}</td>
                  <td>{formatCustomerLabel(item.customer)}</td>
                  <td className="mono">{item.rawValue ?? item.imei ?? item.upc ?? '-'}</td>
                  <td>
                    <span className={exceptionStatusClass(item.status)}>{item.status}</span>
                  </td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {!result || result.items.length === 0 ? (
                <tr>
                  <td colSpan={5}>暂无异常</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="panel data-panel">
          <div className="section-title">
            <h2>处理面板</h2>
            <span>{selected ? selected.type : '请选择异常'}</span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>异常 ID</dt>
              <dd className="mono">{selected?.id ?? '-'}</dd>
            </div>
            <div>
              <dt>客户</dt>
              <dd>{formatCustomerLabel(selected?.customer)}</dd>
            </div>
            <div>
              <dt>UPC / IMEI / UPS</dt>
              <dd className="mono">
                {[selected?.upc, selected?.imei, selected?.upsTrackingNo]
                  .filter(Boolean)
                  .join(' / ') || '-'}
              </dd>
            </div>
            <div>
              <dt>说明</dt>
              <dd>{selected?.message ?? selected?.description ?? '-'}</dd>
            </div>
            <label className="form-field">
              <span>处理备注</span>
              <textarea
                value={resolutionNote}
                onChange={(event) => setResolutionNote(event.target.value)}
              />
            </label>
            <div className="action-row">
              <button
                type="button"
                className="btn"
                disabled={!selected || resolveMutation.isPending}
                onClick={() => selected && resolveMutation.mutate(selected.id)}
              >
                <CheckCircle2 size={16} />
                处理
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={!selected || ignoreMutation.isPending}
                onClick={() => selected && ignoreMutation.mutate(selected.id)}
              >
                <XCircle size={16} />
                忽略
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={!selected || invalidateMutation.isPending}
                onClick={() => selected && invalidateMutation.mutate(selected.id)}
              >
                <ShieldX size={16} />
                无效
              </button>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}

type CustomerOption = { id: string; label: string };
type ExceptionSummary = Record<string, number | undefined>;
type ExceptionResult = { items: ExceptionItem[]; total: number };
type ExceptionItem = {
  id: string;
  type: string;
  status: string;
  rawValue?: string | null;
  upc?: string | null;
  imei?: string | null;
  upsTrackingNo?: string | null;
  message?: string | null;
  description?: string | null;
  createdAt: string;
  customer?: { code: string; name: string } | null;
};

function formatCustomerLabel(customer?: { code?: string | null; name?: string | null } | null) {
  if (!customer) return '-';
  return [customer.code, customer.name].filter(Boolean).join(' - ') || '-';
}

function Metric({ label, value, intent }: { label: string; value: number; intent: string }) {
  return (
    <section className="metric-card">
      <span className={`badge badge-${intent}`}>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function exceptionStatusClass(status: string) {
  if (status === 'RESOLVED') return 'badge badge-success';
  if (status === 'IGNORED') return 'badge badge-info';
  if (status === 'INVALID') return 'badge badge-danger';
  return 'badge badge-warning';
}
