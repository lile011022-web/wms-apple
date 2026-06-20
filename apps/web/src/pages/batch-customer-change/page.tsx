import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { customerChangesApi, customersApi } from '../../api/workflow';

export function BatchCustomerChangePage() {
  const queryClient = useQueryClient();
  const [currentCustomerId, setCurrentCustomerId] = useState('');
  const [newCustomerId, setNewCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<CustomerChangePreview | null>(null);
  const [reason, setReason] = useState('本地联调：入库时选错客户，按业务复核结果批量调整。');
  const [message, setMessage] = useState('');

  const customersQuery = useQuery({
    queryKey: ['customer-options'],
    queryFn: () => customersApi.options(),
  });
  const customers = (customersQuery.data as CustomerOption[] | undefined) ?? [];

  useEffect(() => {
    if (!currentCustomerId && customers[0]) setCurrentCustomerId(customers[0].id);
    if (!newCustomerId && customers[1]) setNewCustomerId(customers[1].id);
  }, [currentCustomerId, customers, newCustomerId]);

  const params = useMemo(
    () => ({
      page: 1,
      pageSize: 50,
      currentCustomerId: currentCustomerId || undefined,
      search: search || undefined,
      sortBy: 'scannedAt',
      sortOrder: 'desc',
    }),
    [currentCustomerId, search],
  );

  const candidatesQuery = useQuery({
    queryKey: ['customer-change-candidates', params],
    queryFn: () => customerChangesApi.candidates(params),
    enabled: Boolean(currentCustomerId),
  });
  const candidates = candidatesQuery.data as CandidateResult | undefined;

  const logsQuery = useQuery({
    queryKey: ['customer-change-logs'],
    queryFn: () => customerChangesApi.logs({ page: 1, pageSize: 20 }),
  });
  const logs = logsQuery.data as ChangeLogResult | undefined;

  const previewMutation = useMutation({
    mutationFn: () =>
      customerChangesApi.preview({
        currentCustomerId,
        newCustomerId,
        inboundItemIds: selectedIds,
      }),
    onSuccess: (data) => {
      setPreview(data as CustomerChangePreview);
      setMessage('');
    },
  });

  const commitMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error('请先预览影响范围');
      return customerChangesApi.commit({
        currentCustomerId,
        newCustomerId,
        inboundItemIds: selectedIds,
        reason,
        previewToken: preview.previewToken,
      });
    },
    onSuccess: async () => {
      setMessage('批量客户修改已提交，库存与异常归属已同步更新');
      setPreview(null);
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ['customer-change-candidates'] });
      await queryClient.invalidateQueries({ queryKey: ['customer-change-logs'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-customer-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });

  const toggleId = (id: string) => {
    setPreview(null);
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <p>Customer Change</p>
          <h1>批量修改客户</h1>
        </div>
        <button type="button" className="btn secondary" onClick={() => candidatesQuery.refetch()}>
          <RefreshCw size={16} />
          刷新候选
        </button>
      </div>

      <section className="panel filter-grid">
        <label>
          <span>当前客户</span>
          <select
            value={currentCustomerId}
            onChange={(event) => {
              setPreview(null);
              setSelectedIds([]);
              setCurrentCustomerId(event.target.value);
            }}
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>新客户</span>
          <select value={newCustomerId} onChange={(event) => setNewCustomerId(event.target.value)}>
            <option value="">请选择新客户</option>
            {customers
              .filter((customer) => customer.id !== currentCustomerId)
              .map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.label}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>搜索</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="UPS / UPC / IMEI / 商品"
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={!newCustomerId || selectedIds.length === 0 || previewMutation.isPending}
          onClick={() => previewMutation.mutate()}
        >
          <Eye size={16} />
          影响预览
        </button>
      </section>

      {customers.length < 2 ? (
        <div className="inline-error">
          需要至少两个客户才能测试批量修改客户，请先到客户管理新增目标客户。
        </div>
      ) : null}
      {message ? <div className="inline-success">{message}</div> : null}

      <div className="grid-2">
        <section className="panel data-panel">
          <div className="section-title">
            <h2>可修改候选</h2>
            <span>
              已选 {selectedIds.length} / 共 {candidates?.total ?? 0} 条
            </span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>选择</th>
                <th>客户</th>
                <th>商品</th>
                <th>IMEI/Serial</th>
                <th>库存状态</th>
                <th>可改</th>
              </tr>
            </thead>
            <tbody>
              {candidates?.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      disabled={!item.changeable}
                      onChange={() => toggleId(item.id)}
                    />
                  </td>
                  <td>{item.customer.code}</td>
                  <td>{item.product?.name ?? '-'}</td>
                  <td className="mono">{item.imei ?? item.serial ?? '-'}</td>
                  <td>{item.inventoryItem?.status ?? '-'}</td>
                  <td>
                    <span
                      className={item.changeable ? 'badge badge-success' : 'badge badge-danger'}
                    >
                      {item.changeable ? '是' : '否'}
                    </span>
                  </td>
                </tr>
              ))}
              {!candidates || candidates.items.length === 0 ? (
                <tr>
                  <td colSpan={6}>暂无候选记录</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="panel data-panel">
          <div className="section-title">
            <h2>影响预览与提交</h2>
            <span>{preview?.canCommit ? '可提交' : '等待预览'}</span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>影响入库项</dt>
              <dd>{preview?.impact.inboundItems ?? 0}</dd>
            </div>
            <div>
              <dt>影响库存项</dt>
              <dd>{preview?.impact.inventoryItems ?? 0}</dd>
            </div>
            <div>
              <dt>影响异常记录</dt>
              <dd>{preview?.impact.exceptionRecords ?? 0}</dd>
            </div>
            <div>
              <dt>阻塞记录</dt>
              <dd>{preview?.blockedCount ?? 0}</dd>
            </div>
            <label className="form-field">
              <span>修改原因</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <button
              type="button"
              className="btn"
              disabled={!preview?.canCommit || !reason || commitMutation.isPending}
              onClick={() => commitMutation.mutate()}
            >
              <CheckCircle2 size={16} />
              提交修改
            </button>
          </dl>
        </section>
      </div>

      <section className="panel data-panel">
        <div className="section-title">
          <h2>修改日志</h2>
          <span>最近 {logs?.items.length ?? 0} 条</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>原客户</th>
              <th>新客户</th>
              <th>数量</th>
              <th>原因</th>
              <th>操作人</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {logs?.items.map((log) => (
              <tr key={log.id}>
                <td>{log.oldCustomer.code}</td>
                <td>{log.newCustomer.code}</td>
                <td>{log.affectedCount}</td>
                <td>{log.reason}</td>
                <td>{log.operator?.name ?? '-'}</td>
                <td>{new Date(log.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!logs || logs.items.length === 0 ? (
              <tr>
                <td colSpan={6}>暂无修改日志</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </section>
  );
}

type CustomerOption = { id: string; label: string };
type CandidateResult = { items: CustomerChangeCandidate[]; total: number };
type CustomerChangeCandidate = {
  id: string;
  customer: { id: string; code: string; name: string };
  product?: { name: string } | null;
  imei?: string | null;
  serial?: string | null;
  inventoryItem?: { status: string } | null;
  changeable: boolean;
};
type CustomerChangePreview = {
  previewToken: string;
  canCommit: boolean;
  blockedCount: number;
  impact: { inboundItems: number; inventoryItems: number; exceptionRecords: number };
};
type ChangeLogResult = { items: ChangeLog[] };
type ChangeLog = {
  id: string;
  oldCustomer: { code: string };
  newCustomer: { code: string };
  operator?: { name: string } | null;
  reason: string;
  affectedCount: number;
  createdAt: string;
};
