import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  FileSpreadsheet,
  PackagePlus,
  RefreshCw,
  Save,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { customersApi, packagePrealertsApi } from '../../api/workflow';
import { PaginationControls } from '../../components/pagination-controls';

const logisticsStatusOptions = [
  { value: 'UNKNOWN', label: '未知' },
  { value: 'IN_TRANSIT', label: '运输中' },
  { value: 'OUT_FOR_DELIVERY', label: '派送中' },
  { value: 'DELIVERED', label: '已送达' },
  { value: 'EXCEPTION', label: '物流异常' },
];
const prealertCreateChunkSize = 500;
const prealertImportMaxRows = 5000;

export function PackagePrealertsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customerId, setCustomerId] = useState('');
  const [trackingText, setTrackingText] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [importRows, setImportRows] = useState<PrealertImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [search, setSearch] = useState('');
  const [prealertPage, setPrealertPage] = useState(1);
  const [prealertPageSize, setPrealertPageSize] = useState(20);
  const [selectedPrealertIds, setSelectedPrealertIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [syncResult, setSyncResult] = useState<unknown>(null);

  const customersQuery = useQuery({
    queryKey: ['customer-options'],
    queryFn: () => customersApi.options(),
  });
  const customers = (customersQuery.data as CustomerOption[] | undefined) ?? [];

  const summaryQuery = useQuery({
    queryKey: ['package-prealert-summary'],
    queryFn: () => packagePrealertsApi.summary(),
  });
  const summary = summaryQuery.data as PackagePrealertSummary | undefined;

  const prealertsQuery = useQuery({
    queryKey: ['package-prealerts', search, prealertPage, prealertPageSize],
    queryFn: () =>
      packagePrealertsApi.list({
        page: prealertPage,
        pageSize: prealertPageSize,
        search: search.trim() || undefined,
      }),
  });
  const result = prealertsQuery.data as PackagePrealertResult | undefined;
  const prealertItems = result?.items ?? [];
  const selectablePrealertIds = prealertItems
    .filter((item) => canDeletePrealert(item))
    .map((item) => item.id);
  const selectedOnCurrentPage = selectablePrealertIds.filter((id) =>
    selectedPrealertIds.includes(id),
  );
  const isCurrentPageSelected =
    selectablePrealertIds.length > 0 &&
    selectedOnCurrentPage.length === selectablePrealertIds.length;

  const manualRows = useMemo(
    () =>
      trackingText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((value, index) => parseManualPrealertLine(value, index + 1, warehouse)),
    [trackingText, warehouse],
  );
  const pendingRows = useMemo(
    () => [
      ...manualRows,
      ...importRows.map((row) => ({ ...row, warehouse: row.warehouse || warehouse })),
    ],
    [importRows, manualRows, warehouse],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const chunks = chunkRows(pendingRows, prealertCreateChunkSize);
      const createdBatches = [];
      for (const chunk of chunks) {
        const result = await packagePrealertsApi.create({
          customerId,
          notes: warehouse,
          items: chunk.map((row) => ({
            trackingNo: row.trackingNo,
            trackingLink: row.trackingLink,
            productModel: row.productModel,
            recipientName: row.recipientName,
            notes: row.warehouse,
          })),
        });
        createdBatches.push(result);
      }
      return {
        batchCount: createdBatches.length,
        rowCount: pendingRows.length,
      };
    },
    onSuccess: (result) => {
      setTrackingText('');
      setWarehouse('');
      clearImportRows();
      setPrealertPage(1);
      setSelectedPrealertIds([]);
      setMessage(`预报已创建：共 ${result.rowCount} 条，拆分为 ${result.batchCount} 个批次`);
      setErrorMessage('');
      void queryClient.invalidateQueries({ queryKey: ['package-prealerts'] });
      void queryClient.invalidateQueries({ queryKey: ['package-prealert-summary'] });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '创建预报失败')),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; logisticsStatus: string; deliveredAt?: string }) =>
      packagePrealertsApi.updateStatus(input.id, {
        logisticsStatus: input.logisticsStatus,
        logisticsUpdatedAt: new Date().toISOString(),
        deliveredAt: input.deliveredAt,
        rawLogisticsStatus: statusLabel(input.logisticsStatus),
      }),
    onSuccess: () => {
      setMessage('物流状态已更新');
      setErrorMessage('');
      void queryClient.invalidateQueries({ queryKey: ['package-prealerts'] });
      void queryClient.invalidateQueries({ queryKey: ['package-prealert-summary'] });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '更新状态失败')),
  });

  const deleteMutation = useMutation({
    mutationFn: (item: PackagePrealertItem) => packagePrealertsApi.deleteItem(item.id),
    onSuccess: () => {
      setMessage('预报已删除');
      setErrorMessage('');
      setSelectedPrealertIds([]);
      void queryClient.invalidateQueries({ queryKey: ['package-prealerts'] });
      void queryClient.invalidateQueries({ queryKey: ['package-prealert-summary'] });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '删除预报失败')),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => packagePrealertsApi.deleteItems(ids),
    onSuccess: (response) => {
      const result = response as BulkDeletePrealertsResult;
      setSelectedPrealertIds([]);
      setMessage(
        result.skipped.length > 0
          ? `已删除 ${result.deleted} 条，跳过 ${result.skipped.length} 条不能删除的预报。`
          : `已删除 ${result.deleted} 条预报`,
      );
      setErrorMessage('');
      void queryClient.invalidateQueries({ queryKey: ['package-prealerts'] });
      void queryClient.invalidateQueries({ queryKey: ['package-prealert-summary'] });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '批量删除预报失败')),
  });

  const sheetsSyncMutation = useMutation({
    mutationFn: (mode: 'push' | 'pull' | 'sync') => {
      if (mode === 'push') {
        return packagePrealertsApi.pushSheets();
      }
      if (mode === 'pull') {
        return packagePrealertsApi.pullSheets();
      }
      return packagePrealertsApi.syncSheets();
    },
    onSuccess: (result, mode) => {
      setSyncResult(result);
      setMessage(
        mode === 'push'
          ? '预报 sheet 写入完成'
          : mode === 'pull'
            ? '状态 sheet 补全完成'
            : 'Google 表格同步完成',
      );
      setErrorMessage('');
      void queryClient.invalidateQueries({ queryKey: ['package-prealerts'] });
      void queryClient.invalidateQueries({ queryKey: ['package-prealert-summary'] });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, 'Google 表格同步失败')),
  });

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customerId || pendingRows.length === 0) {
      setErrorMessage('请选择客户，并至少填写或导入一个物流单号/订单链接。');
      return;
    }
    createMutation.mutate();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const rows = await parsePrealertWorkbook(file);
      setImportRows(rows);
      setImportFileName(file.name);
      setMessage(`已读取 ${rows.length} 条预报，可检查后点击创建。`);
      setErrorMessage('');
    } catch (error) {
      clearImportRows();
      setErrorMessage(error instanceof Error ? error.message : '读取导入模板失败。');
    } finally {
      event.target.value = '';
    }
  };

  const clearImportRows = () => {
    setImportRows([]);
    setImportFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    setPrealertPage(1);
    setSelectedPrealertIds([]);
  }, [search]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / prealertPageSize));
    if (prealertPage > totalPages) {
      setPrealertPage(totalPages);
    }
  }, [prealertPage, prealertPageSize, result?.total]);

  const markDelivered = (item: PackagePrealertItem) => {
    statusMutation.mutate({
      id: item.id,
      logisticsStatus: 'DELIVERED',
      deliveredAt: new Date().toISOString(),
    });
  };

  const deletePrealert = (item: PackagePrealertItem) => {
    if (!canDeletePrealert(item)) {
      setErrorMessage('已入库的预报不能删除。');
      return;
    }
    const confirmed = window.confirm(
      `确认删除预报 ${item.trackingNo} 吗？删除后不会再用于入库匹配。`,
    );
    if (!confirmed) {
      return;
    }
    deleteMutation.mutate(item);
  };

  const togglePrealertSelection = (id: string) => {
    setSelectedPrealertIds((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  };

  const toggleCurrentPageSelection = () => {
    setSelectedPrealertIds((current) => {
      if (isCurrentPageSelected) {
        return current.filter((id) => !selectablePrealertIds.includes(id));
      }
      return Array.from(new Set([...current, ...selectablePrealertIds]));
    });
  };

  const bulkDeletePrealerts = () => {
    if (selectedPrealertIds.length === 0) {
      setErrorMessage('请先勾选需要删除的预报。');
      return;
    }
    const confirmed = window.confirm(
      `确认删除选中的 ${selectedPrealertIds.length} 条预报吗？删除后不会再用于入库匹配。`,
    );
    if (!confirmed) {
      return;
    }
    bulkDeleteMutation.mutate(selectedPrealertIds);
  };

  return (
    <section className="page-frame">
      <div className="page-heading">
        <p>Package Prealert</p>
        <h1>包裹预报</h1>
      </div>

      <section className="summary-grid">
        <SummaryCard label="未扫码入库预报" value={summary?.totalOpen ?? 0} />
        <SummaryCard label="今日预计到达" value={summary?.todayExpected ?? 0} />
        <SummaryCard label="已送达但未扫码" value={summary?.deliveredNotReceived ?? 0} tone="danger" />
        <SummaryCard label="ETA 已过" value={summary?.etaOverdue ?? 0} tone="warning" />
      </section>

      <form className="panel workflow-form" onSubmit={handleCreate}>
        <label>
          <span>客户</span>
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">请选择客户</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>仓库</span>
          <input
            value={warehouse}
            onChange={(event) => setWarehouse(event.target.value)}
            placeholder="例如 BB-DE-252-2"
          />
        </label>
        <label className="wide-field">
          <span>快递单号 / Apple 订单链接 / 物流链接，一行一个</span>
          <textarea
            rows={5}
            value={trackingText}
            onChange={(event) => setTrackingText(event.target.value)}
            placeholder="1Z999AA10123456784&#10;https://www.ups.com/track?tracknum=1Z...&#10;https://www.apple.com/xc/us/vieworder/W1234567890/email@example.com"
          />
        </label>
        <label className="file-import-field">
          <span>批量导入 Excel</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(event) => void handleImportFile(event)}
          />
        </label>
        {importRows.length > 0 ? (
          <div className="prealert-import-preview">
            <div>
              <FileSpreadsheet size={16} />
              <strong>{importFileName}</strong>
              <span>已读取 {importRows.length} 条</span>
            </div>
            <button type="button" className="secondary" onClick={clearImportRows}>
              <X size={16} />
              清空导入
            </button>
          </div>
        ) : null}
        <button type="submit" disabled={createMutation.isPending}>
          <PackagePlus size={16} />
          {createMutation.isPending ? '创建中' : `创建预报 (${pendingRows.length})`}
        </button>
        <button type="button" onClick={() => void prealertsQuery.refetch()}>
          <RefreshCw size={16} />
          刷新
        </button>
      </form>

      {message ? <div className="inline-success">{message}</div> : null}
      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}

      <section className="panel data-panel">
        <div className="section-title">
          <h2>Google 表格同步</h2>
          <span>写“预报”，读“状态”补全单号和入库结果</span>
        </div>
        <div className="customer-row-actions">
          <button
            type="button"
            onClick={() => sheetsSyncMutation.mutate('push')}
            disabled={sheetsSyncMutation.isPending}
          >
            <RefreshCw size={16} />
            写入预报
          </button>
          <button
            type="button"
            onClick={() => sheetsSyncMutation.mutate('pull')}
            disabled={sheetsSyncMutation.isPending}
          >
            <RefreshCw size={16} />
            读取状态补全
          </button>
          <button
            type="button"
            onClick={() => sheetsSyncMutation.mutate('sync')}
            disabled={sheetsSyncMutation.isPending}
          >
            <RefreshCw size={16} />
            完整同步
          </button>
        </div>
        {syncResult ? (
          <pre className="sync-result">{JSON.stringify(syncResult, null, 2)}</pre>
        ) : null}
      </section>

      <section className="panel data-panel">
        <div className="section-title">
          <h2>预报包裹明细</h2>
          <span>共 {result?.total ?? 0} 条</span>
        </div>
        <PaginationControls
          page={prealertPage}
          pageSize={prealertPageSize}
          total={result?.total ?? 0}
          isFetching={prealertsQuery.isFetching}
          onPageChange={setPrealertPage}
          onPageSizeChange={(nextPageSize) => {
            setPrealertPageSize(nextPageSize);
            setPrealertPage(1);
          }}
        >
          <button
            type="button"
            className="btn danger"
            disabled={selectedPrealertIds.length === 0 || bulkDeleteMutation.isPending}
            onClick={bulkDeletePrealerts}
          >
            <Trash2 size={14} />
            删除选中 ({selectedPrealertIds.length})
          </button>
        </PaginationControls>
        <div className="workflow-form compact-form">
          <label>
            <span>搜索单号/客户/批次</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={isCurrentPageSelected}
                  disabled={selectablePrealertIds.length === 0}
                  onChange={toggleCurrentPageSelection}
                  aria-label="选择当前页可删除预报"
                />
              </th>
              <th>客户</th>
              <th>物流单号 / 订单引用</th>
              <th>物流状态</th>
              <th>预计到达</th>
              <th>实际送达</th>
              <th>WMS入库状态</th>
              <th>表格同步</th>
              <th>风险</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {prealertItems.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedPrealertIds.includes(item.id)}
                    disabled={!canDeletePrealert(item)}
                    onChange={() => togglePrealertSelection(item.id)}
                    aria-label={`选择预报 ${item.trackingNo}`}
                  />
                </td>
                <td>{item.customer.code}</td>
                <td>
                  <div className="mono">{item.trackingNo}</div>
                  <small>{item.batch.batchNo}</small>
                </td>
                <td>
                  <StatusPill status={item.logisticsStatus} />
                </td>
                <td>{formatDateTime(item.estimatedArrivalAt)}</td>
                <td>{formatDateTime(item.deliveredAt)}</td>
                <td>{receivingLabel(item.receivingStatus)}</td>
                <td>
                  <StatusPill status={item.exchangePushStatus ?? 'PENDING'} />
                  {item.exchangeSyncError ? <small>{item.exchangeSyncError}</small> : null}
                </td>
                <td>
                  {item.alerts.length > 0
                    ? item.alerts.map((alert) => alertLabel(alert.alertType)).join(', ')
                    : '-'}
                </td>
                <td>
                  <div className="customer-row-actions">
                    <select
                      value={item.logisticsStatus}
                      onChange={(event) =>
                        statusMutation.mutate({ id: item.id, logisticsStatus: event.target.value })
                      }
                    >
                      {logisticsStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="table-action"
                      disabled={statusMutation.isPending}
                      onClick={() => markDelivered(item)}
                    >
                      <Save size={14} />
                      已送达
                    </button>
                    <button
                      type="button"
                      className="table-action danger"
                      disabled={deleteMutation.isPending || !canDeletePrealert(item)}
                      onClick={() => deletePrealert(item)}
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!result || prealertItems.length === 0 ? (
              <tr>
                <td colSpan={10}>暂无预报包裹</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="panel data-panel">
        <div className="section-title">
          <h2>未来到达关注</h2>
          <span>按预计到达时间排序</span>
        </div>
        <div className="dashboard-inbound-breakdown">
          {(summary?.nextArrivals ?? []).map((item) => (
            <div key={item.id}>
              <span>
                <Truck size={14} /> {item.customer.code} / {item.trackingNo}
              </span>
              <strong>
                <Clock size={14} /> {formatDateTime(item.estimatedArrivalAt)}
              </strong>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`metric-card ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`status-pill status-${status.toLowerCase()}`}>{statusLabel(status)}</span>
  );
}

function statusLabel(status: string) {
  const exchangeLabels: Record<string, string> = {
    PENDING: '待推送',
    PUSHED: '已推送',
    FAILED: '推送失败',
    SKIPPED: '已跳过',
  };
  if (exchangeLabels[status]) {
    return exchangeLabels[status];
  }
  return logisticsStatusOptions.find((item) => item.value === status)?.label ?? status;
}

function receivingLabel(status: string) {
  const labels: Record<string, string> = {
    NOT_RECEIVED: '未扫码入库',
    PARTIALLY_RECEIVED: '部分入库',
    RECEIVED: '已入库',
    VOIDED: '已作废',
  };
  return labels[status] ?? status;
}

function canDeletePrealert(item: PackagePrealertItem) {
  return item.receivingStatus !== 'RECEIVED' && !item.inboundBatch;
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

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function toUserErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function parsePrealertWorkbook(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellDates: false,
    cellText: true,
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('导入文件没有可读取的工作表。');
  }
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    throw new Error('导入文件的第一个工作表无法读取。');
  }
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
  const effectiveRange = findEffectiveRange(sheet, range);
  const headers = readHeaderRow(sheet, range.s.r, effectiveRange.startCol, effectiveRange.endCol);
  const warehouseCol = findHeaderIndex(headers, ['仓库', '预报仓库', '备注']);
  const productModelCol = findHeaderIndex(headers, ['型号', '产品型号', '商品型号', 'model']);
  const recipientNameCol = findHeaderIndex(headers, ['姓名', '名字', '收件人', 'name']);
  const trackingNoCol = findHeaderIndex(headers, [
    '单号',
    '物流单号',
    '快递单号',
    '追踪单号',
    'trackingno',
    'tracking no',
  ]);
  const trackingLinkCol = findHeaderIndex(headers, [
    '超链接',
    '链接',
    '物流链接',
    '订单链接',
    'apple订单链接',
    'apple order link',
  ]);

  if (trackingNoCol === -1 && trackingLinkCol === -1) {
    throw new Error('导入模板必须包含“单号”或“超链接”列。');
  }

  const rows: PrealertImportRow[] = [];
  for (let rowIndex = range.s.r + 1; rowIndex <= effectiveRange.endRow; rowIndex += 1) {
    const trackingNo =
      trackingNoCol >= 0 ? readCellText(sheet, rowIndex, trackingNoCol).replace(/\s+/g, '') : '';
    const trackingLink = trackingLinkCol >= 0 ? readCellText(sheet, rowIndex, trackingLinkCol) : '';
    const rowWarehouse = warehouseCol >= 0 ? readCellText(sheet, rowIndex, warehouseCol) : '';
    const productModel = productModelCol >= 0 ? readCellText(sheet, rowIndex, productModelCol) : '';
    const recipientName =
      recipientNameCol >= 0 ? readCellText(sheet, rowIndex, recipientNameCol) : '';
    if (!trackingNo && !trackingLink && !rowWarehouse && !productModel && !recipientName) {
      continue;
    }
    if (!trackingNo && !trackingLink) {
      throw new Error(`第 ${rowIndex + 1} 行缺少单号或超链接。`);
    }
    rows.push({
      trackingNo: trackingNo || undefined,
      trackingLink: trackingLink || undefined,
      warehouse: rowWarehouse,
      productModel: productModel || undefined,
      recipientName: recipientName || undefined,
      sourceRow: rowIndex + 1,
    });
    if (rows.length > prealertImportMaxRows) {
      throw new Error(`一次最多导入 ${prealertImportMaxRows} 条预报，请拆分文件后再导入。`);
    }
  }

  if (rows.length === 0) {
    throw new Error('导入文件没有有效预报行。');
  }

  return rows;
}

function readHeaderRow(sheet: XLSX.WorkSheet, rowIndex: number, startCol: number, endCol: number) {
  const headers: string[] = [];
  for (let colIndex = startCol; colIndex <= endCol; colIndex += 1) {
    headers[colIndex] = normalizeHeader(readCellText(sheet, rowIndex, colIndex));
  }
  return headers;
}

function findEffectiveRange(sheet: XLSX.WorkSheet, fallback: XLSX.Range) {
  let endRow = fallback.s.r;
  let startCol = fallback.s.c;
  let endCol = fallback.e.c;
  let foundCell = false;
  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!')) {
      continue;
    }
    const cell = sheet[key];
    if (!cell || (cell.v === undefined && cell.w === undefined && !cell.l?.Target)) {
      continue;
    }
    const address = XLSX.utils.decode_cell(key);
    foundCell = true;
    endRow = Math.max(endRow, address.r);
    startCol = Math.min(startCol, address.c);
    endCol = Math.max(endCol, address.c);
  }
  return foundCell ? { endRow, startCol, endCol } : { endRow: fallback.e.r, startCol, endCol };
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.findIndex((header) => normalizedAliases.includes(header));
}

function readCellText(sheet: XLSX.WorkSheet, rowIndex: number, colIndex: number) {
  const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  const cell = sheet[cellAddress];
  const hyperlink = typeof cell?.l?.Target === 'string' ? cell.l.Target : '';
  const value = cell?.w ?? cell?.v ?? '';
  return String(hyperlink || value).trim();
}

function normalizeHeader(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function parseManualPrealertLine(
  value: string,
  sourceRow: number,
  fallbackWarehouse: string,
): PrealertImportRow {
  const cells = value
    .split('\t')
    .map((cell) => cell.trim())
    .filter(Boolean);
  const link = cells.find((cell) => /^https?:\/\//i.test(cell));
  if (cells.length > 1 && link) {
    return {
      trackingNo: undefined,
      trackingLink: link,
      warehouse: cells[0] && cells[0] !== link ? cells[0] : fallbackWarehouse,
      sourceRow,
    };
  }
  return {
    trackingNo: value.startsWith('http') ? undefined : value,
    trackingLink: value.startsWith('http') ? value : undefined,
    warehouse: fallbackWarehouse,
    sourceRow,
  };
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

type CustomerOption = { id: string; label: string };
type PrealertImportRow = {
  trackingNo?: string;
  trackingLink?: string;
  productModel?: string;
  recipientName?: string;
  warehouse: string;
  sourceRow: number;
};
type PackagePrealertResult = { items: PackagePrealertItem[]; total: number };
type BulkDeletePrealertsResult = {
  requested: number;
  deleted: number;
  skipped: Array<{ id: string; trackingNo?: string; reason: string }>;
};
type PackagePrealertSummary = {
  totalOpen: number;
  todayExpected: number;
  deliveredNotReceived: number;
  etaOverdue: number;
  nextArrivals: PackagePrealertItem[];
};
type PackagePrealertItem = {
  id: string;
  batch: { batchNo: string };
  customer: { id: string; code: string; name: string };
  trackingNo: string;
  logisticsStatus: string;
  estimatedArrivalAt?: string | null;
  deliveredAt?: string | null;
  receivingStatus: string;
  inboundBatch?: { id: string; batchNo: string } | null;
  exchangePushStatus?: string | null;
  exchangeSyncError?: string | null;
  alerts: Array<{ id: string; alertType: string; severity: string; status: string }>;
};
