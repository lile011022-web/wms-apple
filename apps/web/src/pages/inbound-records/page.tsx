import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Edit3, RefreshCw, Save, Search, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { customersApi, inboundApi } from '../../api/workflow';
import { HorizontalScrollControl } from '../../components/horizontal-scroll-control';
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
  const [recordEdit, setRecordEdit] = useState<InboundRecordEdit | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const recordsTableRef = useRef<HTMLDivElement | null>(null);
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
  const editingRecord = recordEdit
    ? records?.items.find((item) => item.id === recordEdit.itemId)
    : undefined;

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

  const correctRecordMutation = useMutation({
    mutationFn: (input: InboundRecordEdit) =>
      inboundApi.correctRecord(input.itemId, {
        upsTrackingNo: input.upsTrackingNo,
        upc: input.upc,
        imei: input.identityType === 'IMEI' ? input.identityValue : undefined,
        serial: input.identityType === 'SERIAL' ? input.identityValue : undefined,
        reason: input.reason,
      }),
    onSuccess: () => {
      setRecordEdit(null);
      setMessage('入库记录已修正，入库明细和库存商品归属已同步更新。');
      setErrorMessage('');
      void recordsQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      void queryClient.invalidateQueries({ queryKey: ['outbound-available-items'] });
    },
    onError: (error) => {
      setMessage('');
      setErrorMessage(error instanceof Error ? error.message : '入库记录修正失败');
    },
  });

  function handleForceConfirm(item: InboundRecord) {
    setMessage('');
    setErrorMessage('');
    const reason = window.prompt('请输入强制入库原因');
    if (!reason) return;
    forceConfirmMutation.mutate({ itemId: item.id, reason });
  }

  function startRecordEdit(item: InboundRecord) {
    setRecordEdit({
      itemId: item.id,
      upsTrackingNo: item.upsTrackingNo ?? '',
      upc: item.upc,
      identityType: item.serial ? 'SERIAL' : 'IMEI',
      identityValue: item.serial ?? item.imei ?? '',
      reason: '入库记录人工修正',
    });
    setMessage('');
    setErrorMessage('');
  }

  function cancelRecordEdit() {
    setRecordEdit(null);
  }

  function updateRecordEdit(patch: Partial<InboundRecordEdit>) {
    setRecordEdit((current) => (current ? { ...current, ...patch } : current));
  }

  function saveRecordEdit() {
    if (!recordEdit) return;
    const nextUpc = recordEdit.upc.trim();
    const reason = recordEdit.reason.trim();
    const identityValue = recordEdit.identityValue.trim();
    if (!nextUpc) {
      setErrorMessage('请填写修正后的 UPC');
      return;
    }
    if (!identityValue) {
      setErrorMessage('请填写修正后的 IMEI 或 Serial');
      return;
    }
    if (!reason) {
      setErrorMessage('请填写修正原因');
      return;
    }
    correctRecordMutation.mutate({
      ...recordEdit,
      upc: nextUpc,
      identityValue,
      reason,
    });
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
        <div ref={recordsTableRef} className="inbound-records-table-wrap">
          <table className="data-table inbound-records-table">
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
                <th>入库时间</th>
                <th>操作人员</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {records?.items.map((item) => {
                const canForceConfirm =
                  item.status === 'EXCEPTION' && Boolean(item.product) && !item.inventoryItemId;
                const isEditing = recordEdit?.itemId === item.id;
                const canCorrectRecord = canRecordBeCorrected(item);
                return (
                  <tr key={item.id} className={isEditing ? 'selected-record-row' : undefined}>
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
                    <td>
                      <TimeCell value={item.scannedAt ?? item.createdAt} />
                    </td>
                    <td>
                      <TimeCell value={item.receivedAt ?? item.batch?.confirmedAt ?? null} />
                    </td>
                    <td>{formatOperator(item.batch?.operator ?? item.inboundBatch?.operator)}</td>
                    <td>
                      <div className="inbound-record-actions">
                        {canCorrectRecord ? (
                          <button
                            type="button"
                            className={
                              isEditing
                                ? 'table-action inbound-record-action-btn'
                                : 'table-action secondary inbound-record-action-btn'
                            }
                            disabled={correctRecordMutation.isPending}
                            onClick={() => (isEditing ? saveRecordEdit() : startRecordEdit(item))}
                          >
                            {isEditing ? <Save size={13} /> : <Edit3 size={13} />}
                            {isEditing
                              ? correctRecordMutation.isPending
                                ? '保存中'
                                : '保存'
                              : '编辑'}
                          </button>
                        ) : null}
                        {canForceConfirm ? (
                          <button
                            type="button"
                            className="table-action inbound-record-action-btn"
                            disabled={forceConfirmMutation.isPending}
                            onClick={() => handleForceConfirm(item)}
                          >
                            <ShieldCheck size={13} />
                            强制入库
                          </button>
                        ) : null}
                        {!canCorrectRecord && !canForceConfirm ? '-' : null}
                      </div>
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
        </div>
        <HorizontalScrollControl targetRef={recordsTableRef} />
      </section>

      <aside className={`record-edit-drawer${recordEdit ? ' open' : ''}`} aria-hidden={!recordEdit}>
        <div className="record-edit-drawer-head">
          <div>
            <p>编辑入库货物</p>
            <h2>{editingRecord?.batch?.batchNo ?? editingRecord?.inboundBatch?.batchNo ?? '-'}</h2>
          </div>
          <button type="button" className="icon-button secondary" onClick={cancelRecordEdit}>
            <X size={18} />
          </button>
        </div>

        {recordEdit ? (
          <>
            <div className="record-edit-summary">
              <span>{editingRecord?.customer?.code ?? '-'}</span>
              <strong>{editingRecord?.product?.name ?? '-'}</strong>
              <span className={statusClass(editingRecord?.status ?? '')}>
                {editingRecord?.forcedInbound ? 'FORCED' : (editingRecord?.status ?? '-')}
              </span>
            </div>

            <div className="record-edit-form">
              <label>
                <span>货物单号</span>
                <input
                  value={recordEdit.upsTrackingNo}
                  onChange={(event) => updateRecordEdit({ upsTrackingNo: event.target.value })}
                  placeholder="UPS / USPS / FedEx"
                />
              </label>
              <label>
                <span>UPC</span>
                <input
                  value={recordEdit.upc}
                  onChange={(event) => updateRecordEdit({ upc: event.target.value })}
                  placeholder="输入正确 UPC"
                />
              </label>
              <label>
                <span>IMEI / Serial</span>
                <input
                  value={recordEdit.identityValue}
                  onChange={(event) => updateRecordEdit({ identityValue: event.target.value })}
                  placeholder="扫描或输入正确 IMEI"
                />
              </label>
              <label>
                <span>识别类型</span>
                <select
                  value={recordEdit.identityType}
                  onChange={(event) =>
                    updateRecordEdit({
                      identityType: event.target.value as InboundRecordEdit['identityType'],
                    })
                  }
                >
                  <option value="IMEI">IMEI</option>
                  <option value="SERIAL">Serial</option>
                </select>
              </label>
              <label>
                <span>修正备注</span>
                <input
                  value={recordEdit.reason}
                  onChange={(event) => updateRecordEdit({ reason: event.target.value })}
                  placeholder="用于审计记录"
                />
              </label>
            </div>

            <div className="record-edit-drawer-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={correctRecordMutation.isPending}
                onClick={cancelRecordEdit}
              >
                取消
              </button>
              <button
                type="button"
                className="btn"
                disabled={correctRecordMutation.isPending}
                onClick={saveRecordEdit}
              >
                <Save size={16} />
                {correctRecordMutation.isPending ? '保存中' : '保存入库'}
              </button>
            </div>
          </>
        ) : null}
      </aside>
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
  inventoryStatus?: string | null;
  receivedAt?: string | null;
  forcedInbound?: boolean;
  forceReason?: string | null;
  forcedAt?: string | null;
  forcedById?: string | null;
  scannedAt?: string | null;
  createdAt: string;
  customer?: { code: string; name: string } | null;
  product?: { id?: string; name: string; modelCode?: string | null } | null;
  batch?: {
    batchNo: string;
    confirmedAt?: string | null;
    operator?: OperatorSummary | null;
  } | null;
  inboundBatch?: {
    batchNo: string;
    confirmedAt?: string | null;
    operator?: OperatorSummary | null;
  } | null;
};
type InboundRecordEdit = {
  itemId: string;
  upsTrackingNo: string;
  upc: string;
  identityType: 'IMEI' | 'SERIAL';
  identityValue: string;
  reason: string;
};
type OperatorSummary = { id: string; email: string; name: string };
type InboundExportPreview = { estimatedRowCount: number };

function canRecordBeCorrected(item: InboundRecord) {
  if (item.status === 'CONFIRMED') {
    return (
      Boolean(item.inventoryItemId) &&
      (item.inventoryStatus === 'IN_STOCK' || item.inventoryStatus === 'EXCEPTION')
    );
  }
  return item.status === 'EXCEPTION' || item.status === 'PENDING';
}

function statusClass(status: string) {
  if (status === 'CONFIRMED') return 'badge badge-success';
  if (status === 'EXCEPTION') return 'badge badge-danger';
  return 'badge badge-warning';
}

function TimeCell({ value }: { value?: string | null }) {
  if (!value) {
    return <span className="time-cell muted">-</span>;
  }
  const date = new Date(value);
  return (
    <span className="time-cell">
      <strong>{date.toLocaleDateString()}</strong>
      <span>{date.toLocaleTimeString()}</span>
    </span>
  );
}

function formatOperator(operator?: OperatorSummary | null) {
  if (!operator) return '-';
  return operator.name ? `${operator.name} (${operator.email})` : operator.email;
}
