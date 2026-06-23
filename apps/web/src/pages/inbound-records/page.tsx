import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { customersApi, inboundApi } from '../../api/workflow';
import { PaginationControls } from '../../components/pagination-controls';

export function InboundRecordsPage() {
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [upc, setUpc] = useState('');
  const [imei, setImei] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [preview, setPreview] = useState<InboundExportPreview | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const queryClient = useQueryClient();

  const customersQuery = useQuery({
    queryKey: ['customer-options'],
    queryFn: () => customersApi.options(),
  });
  const customers = (customersQuery.data as CustomerOption[] | undefined) ?? [];

  useEffect(() => {
    if (!customerId && customers[0]) setCustomerId(customers[0].id);
  }, [customerId, customers]);

  const params = useMemo(
    () => ({
      page,
      pageSize,
      customerId: customerId || undefined,
      status: status || undefined,
      search: search || undefined,
      upc: upc || undefined,
      imei: imei || undefined,
      sortBy: 'scannedAt',
      sortOrder: 'desc',
    }),
    [customerId, imei, page, pageSize, search, status, upc],
  );

  const recordsQuery = useQuery({
    queryKey: ['inbound-records', params],
    queryFn: () => inboundApi.records(params),
    enabled: Boolean(customerId),
  });
  const records = recordsQuery.data as InboundRecordsResult | undefined;

  const previewMutation = useMutation({
    mutationFn: () => inboundApi.exportPreview(params),
    onSuccess: (data) => setPreview(data as InboundExportPreview),
  });

  const forceConfirmMutation = useMutation({
    mutationFn: ({ itemId, reason }: { itemId: string; reason: string }) =>
      inboundApi.forceConfirmRecord(itemId, { reason }),
    onSuccess: () => {
      setMessage('已强制入库，并记录原因与审计日志。');
      setErrorMessage('');
      void recordsQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (error) => {
      setMessage('');
      setErrorMessage(error instanceof Error ? error.message : '强制入库失败');
    },
  });

  function handleForceConfirm(item: InboundRecord) {
    setMessage('');
    setErrorMessage('');
    const reason = window.prompt('请输入强制入库原因');
    if (!reason) return;
    forceConfirmMutation.mutate({ itemId: item.id, reason });
  }

  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <p>Inbound</p>
          <h1>入库记录</h1>
        </div>
        <button type="button" className="btn secondary" onClick={() => recordsQuery.refetch()}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>

      <section className="panel filter-grid">
        <label>
          <span>客户</span>
          <select
            value={customerId}
            onChange={(event) => {
              setCustomerId(event.target.value);
              setPage(1);
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
          <span>状态</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">全部</option>
            <option value="PENDING">待确认</option>
            <option value="CONFIRMED">已确认</option>
            <option value="EXCEPTION">异常</option>
          </select>
        </label>
        <label>
          <span>UPC</span>
          <input
            value={upc}
            onChange={(event) => {
              setUpc(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          <span>IMEI</span>
          <input
            value={imei}
            onChange={(event) => {
              setImei(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          <span>搜索</span>
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="UPS / 商品 / 序列号"
          />
        </label>
        <button type="button" className="btn" onClick={() => recordsQuery.refetch()}>
          <Search size={16} />
          查询
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={previewMutation.isPending}
          onClick={() => previewMutation.mutate()}
        >
          <Download size={16} />
          导出预览
        </button>
      </section>

      {preview ? (
        <div className="inline-success">
          当前筛选预计导出 {preview.estimatedRowCount} 行，后端已返回可复用报表参数。
        </div>
      ) : null}
      {message ? <div className="inline-success">{message}</div> : null}
      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}

      <section className="panel data-panel">
        <div className="section-title">
          <h2>入库明细</h2>
          <span>共 {records?.total ?? 0} 条</span>
        </div>
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={records?.total ?? 0}
          isFetching={recordsQuery.isFetching}
          onPageChange={setPage}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
        />
        <table className="data-table">
          <thead>
            <tr>
              <th>批次</th>
              <th>客户</th>
              <th>UPC</th>
              <th>IMEI/Serial</th>
              <th>商品</th>
              <th>UPS</th>
              <th>状态</th>
              <th>扫描时间</th>
              <th>操作人员</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {records?.items.map((item) => {
              const canForceConfirm =
                item.status === 'EXCEPTION' && Boolean(item.product) && !item.inventoryItemId;
              return (
                <tr key={item.id}>
                  <td className="mono">
                    {item.batch?.batchNo ?? item.inboundBatch?.batchNo ?? '-'}
                  </td>
                  <td>{item.customer?.code ?? '-'}</td>
                  <td className="mono">{item.upc}</td>
                  <td className="mono">{item.imei ?? item.serial ?? '-'}</td>
                  <td>{item.product?.name ?? '-'}</td>
                  <td className="mono">{item.upsTrackingNo ?? '-'}</td>
                  <td>
                    <span className={statusClass(item.status)}>
                      {item.forcedInbound ? 'FORCED' : item.status}
                    </span>
                  </td>
                  <td>{formatDate(item.scannedAt ?? item.createdAt)}</td>
                  <td>{formatOperator(item.batch?.operator ?? item.inboundBatch?.operator)}</td>
                  <td>
                    {canForceConfirm ? (
                      <button
                        type="button"
                        className="table-action"
                        disabled={forceConfirmMutation.isPending}
                        onClick={() => handleForceConfirm(item)}
                      >
                        <ShieldCheck size={14} />
                        强制入库
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              );
            })}
            {!records || records.items.length === 0 ? (
              <tr>
                <td colSpan={10}>暂无入库记录</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </section>
  );
}

type CustomerOption = { id: string; label: string };
type InboundRecordsResult = {
  items: InboundRecord[];
  total: number;
  page: number;
  pageSize: number;
};
type InboundRecord = {
  id: string;
  upc: string;
  imei?: string | null;
  serial?: string | null;
  upsTrackingNo?: string | null;
  status: string;
  inventoryItemId?: string | null;
  forcedInbound?: boolean;
  forceReason?: string | null;
  forcedAt?: string | null;
  forcedById?: string | null;
  scannedAt?: string | null;
  createdAt: string;
  customer?: { code: string; name: string } | null;
  product?: { name: string } | null;
  batch?: { batchNo: string; operator?: OperatorSummary | null } | null;
  inboundBatch?: { batchNo: string; operator?: OperatorSummary | null } | null;
};
type OperatorSummary = { id: string; email: string; name: string };
type InboundExportPreview = { estimatedRowCount: number };

function statusClass(status: string) {
  if (status === 'CONFIRMED') return 'badge badge-success';
  if (status === 'EXCEPTION') return 'badge badge-danger';
  return 'badge badge-warning';
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function formatOperator(operator?: OperatorSummary | null) {
  if (!operator) return '-';
  return operator.name ? `${operator.name} (${operator.email})` : operator.email;
}
