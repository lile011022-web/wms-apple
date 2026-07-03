import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Download, Eye, FileSpreadsheet, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { customersApi, reportsApi } from '../../api/workflow';

const reportTypes = [
  { value: 'INBOUND_DETAIL', label: '入库明细' },
  { value: 'OUTBOUND_DETAIL', label: '装箱明细' },
  { value: 'INVENTORY_DETAIL', label: '库存明细' },
  { value: 'EXCEPTION_DETAIL', label: '异常明细' },
  { value: 'CUSTOMER_CHANGE_LOG', label: '客户修改日志' },
  { value: 'AUDIT_LOG', label: '审计日志' },
];

const inboundExcelLayouts = [
  { value: 'STANDARD', label: '系统入库明细表' },
  { value: 'INBOUND_REGISTRATION', label: '飞书入库登记表' },
];

const outboundExcelLayouts = [
  { value: 'STANDARD', label: '现有客户核对表' },
  { value: 'PACKED_SUMMARY', label: '已装箱汇总表格' },
];

const inventoryExcelLayouts = [
  { value: 'STANDARD', label: '现有库存明细表' },
  { value: 'WAREHOUSE_HOLD', label: '未封箱留仓汇总表格' },
];

const boxSizeOptions = [
  { value: '', label: '全部箱子类型' },
  { value: '12*12*12', label: '12 x 12 x 12' },
  { value: '14*14*14', label: '14 x 14 x 14' },
  { value: 'CUSTOM', label: 'Custom' },
];

const inboundStatusOptions = [
  { value: 'CONFIRMED', label: '已确认入库' },
  { value: '', label: '全部状态' },
  { value: 'PENDING', label: '待确认' },
  { value: 'EXCEPTION', label: '异常' },
  { value: 'VOIDED', label: '已作废' },
];

export function DetailDownloadPage() {
  const queryClient = useQueryClient();
  const [reportType, setReportType] = useState('INVENTORY_DETAIL');
  const [format, setFormat] = useState('CSV');
  const [customerId, setCustomerId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [inboundStatus, setInboundStatus] = useState('CONFIRMED');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [sealedOnly, setSealedOnly] = useState(true);
  const [exportLayout, setExportLayout] = useState('STANDARD');
  const [boxSizePreset, setBoxSizePreset] = useState('');
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [selectedBoxNos, setSelectedBoxNos] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const hasInvalidDateRange = Boolean(dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo));

  const customersQuery = useQuery({
    queryKey: ['customer-options'],
    queryFn: () => customersApi.options(),
  });
  const customers = (customersQuery.data as CustomerOption[] | undefined) ?? [];
  const inboundBatchesQuery = useQuery({
    queryKey: ['report-inbound-batches', customerId],
    queryFn: () =>
      reportsApi.inboundBatches({ page: 1, pageSize: 100, customerId: customerId || undefined }),
    enabled: reportType === 'INBOUND_DETAIL',
  });
  const inboundBatches =
    ((inboundBatchesQuery.data as ExportBatchResult | undefined)?.items as
      | InboundBatchOption[]
      | undefined) ?? [];
  const outboundBoxesQuery = useQuery({
    queryKey: [
      'report-outbound-boxes',
      customerId,
      dateFrom,
      dateTo,
      search,
      sealedOnly,
      boxSizePreset,
    ],
    queryFn: () =>
      reportsApi.outboundBoxes({
        page: 1,
        pageSize: 100,
        customerId: customerId || undefined,
        dateFrom: toIsoDateTime(dateFrom),
        dateTo: toIsoDateTime(dateTo),
        search: search || undefined,
        outboundStatus: sealedOnly ? 'SEALED' : undefined,
        sizePreset: boxSizePreset || undefined,
      }),
    enabled: reportType === 'OUTBOUND_DETAIL' && !hasInvalidDateRange,
  });
  const outboundBoxes =
    ((outboundBoxesQuery.data as ExportOutboundBoxResult | undefined)?.items as
      | OutboundBoxOption[]
      | undefined) ?? [];

  const filters = useMemo(
    () => ({
      customerId: customerId || undefined,
      batchId: reportType === 'INBOUND_DETAIL' ? batchId || undefined : undefined,
      inboundStatus: reportType === 'INBOUND_DETAIL' && inboundStatus ? inboundStatus : undefined,
      dateFrom: toIsoDateTime(dateFrom),
      dateTo: toIsoDateTime(dateTo),
      search: search || undefined,
      boxNos:
        reportType === 'OUTBOUND_DETAIL' && selectedBoxNos.length > 0 ? selectedBoxNos : undefined,
      outboundStatus:
        reportType === 'OUTBOUND_DETAIL' && sealedOnly
          ? 'SEALED'
          : reportType === 'INVENTORY_DETAIL' &&
              format === 'EXCEL' &&
              exportLayout === 'WAREHOUSE_HOLD'
            ? 'OPEN'
            : undefined,
      inventoryStatus:
        reportType === 'INVENTORY_DETAIL' && format === 'EXCEL' && exportLayout === 'WAREHOUSE_HOLD'
          ? 'PACKED'
          : undefined,
    }),
    [
      batchId,
      customerId,
      dateFrom,
      dateTo,
      exportLayout,
      format,
      inboundStatus,
      reportType,
      sealedOnly,
      search,
      selectedBoxNos,
      boxSizePreset,
    ],
  );

  const exportsQuery = useQuery({
    queryKey: ['report-exports', reportType],
    queryFn: () => reportsApi.exports({ page: 1, pageSize: 30, reportType }),
  });
  const exports = exportsQuery.data as ExportResult | undefined;

  const previewMutation = useMutation({
    mutationFn: () => {
      if (hasInvalidDateRange) {
        throw new Error('结束时间不能早于开始时间');
      }
      return reportsApi.preview({ reportType, filters });
    },
    onSuccess: (data) => {
      const nextPreview = data as ReportPreview;
      setPreview(nextPreview);
      setSelectedFields(nextPreview.selectedFields);
      setMessage('');
      setErrorMessage('');
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '导出预览失败')),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (hasInvalidDateRange) {
        throw new Error('结束时间不能早于开始时间');
      }
      return reportsApi.createExport({
        reportType,
        format,
        exportLayout:
          (reportType === 'INBOUND_DETAIL' ||
            reportType === 'OUTBOUND_DETAIL' ||
            reportType === 'INVENTORY_DETAIL') &&
          format === 'EXCEL'
            ? exportLayout
            : undefined,
        filters,
        fields: selectedFields,
      });
    },
    onSuccess: async (data) => {
      const created = data as ReportExport;
      await queryClient.invalidateQueries({ queryKey: ['report-exports'] });
      if (created.status === 'COMPLETED') {
        const file = (await reportsApi.download(created.id)) as ReportDownload;
        downloadReportFile(file);
        setMessage(
          `导出已生成并下载：${file.fileName}，共 ${file.rowCount} 行。可在浏览器下载记录中查看。`,
        );
      } else {
        setMessage(`导出任务已创建：${created.fileName ?? created.id}，完成后可在历史中下载。`);
      }
      setErrorMessage('');
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '生成导出失败')),
  });

  const downloadMutation = useMutation({
    mutationFn: (id: string) => reportsApi.download(id),
    onSuccess: (data) => {
      const file = data as ReportDownload;
      downloadReportFile(file);
      setMessage(
        `已下载 ${file.fileName}，共 ${file.rowCount} 行。文件已保存到浏览器默认下载位置。`,
      );
      setErrorMessage('');
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '下载导出文件失败')),
  });

  useEffect(() => {
    setPreview(null);
    setSelectedFields([]);
    setSelectedBoxNos([]);
    if (reportType === 'INBOUND_DETAIL') {
      setInboundStatus('CONFIRMED');
    }
  }, [reportType]);

  useEffect(() => {
    setPreview(null);
  }, [filters]);

  useEffect(() => {
    setBatchId('');
  }, [customerId, reportType]);

  useEffect(() => {
    setSelectedBoxNos([]);
  }, [customerId, dateFrom, dateTo, sealedOnly, boxSizePreset]);

  useEffect(() => {
    if (
      (reportType !== 'INBOUND_DETAIL' &&
        reportType !== 'OUTBOUND_DETAIL' &&
        reportType !== 'INVENTORY_DETAIL') ||
      format !== 'EXCEL'
    ) {
      setExportLayout('STANDARD');
    }
  }, [format, reportType]);

  const excelLayouts =
    reportType === 'INBOUND_DETAIL'
      ? inboundExcelLayouts
      : reportType === 'OUTBOUND_DETAIL'
        ? outboundExcelLayouts
        : reportType === 'INVENTORY_DETAIL'
          ? inventoryExcelLayouts
          : [];

  useEffect(() => {
    if (
      format === 'EXCEL' &&
      excelLayouts.length > 0 &&
      !excelLayouts.some((layout) => layout.value === exportLayout)
    ) {
      setExportLayout('STANDARD');
    }
  }, [excelLayouts, exportLayout, format]);

  const toggleField = (field: string) => {
    setSelectedFields((current) =>
      current.includes(field) ? current.filter((item) => item !== field) : [...current, field],
    );
  };

  const toggleBox = (boxNo: string) => {
    setSelectedBoxNos((current) =>
      current.includes(boxNo) ? current.filter((item) => item !== boxNo) : [...current, boxNo],
    );
  };

  const selectVisibleBoxes = () => {
    setSelectedBoxNos((current) => [
      ...new Set([...current, ...outboundBoxes.map((box) => box.boxNo)]),
    ]);
  };

  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <p>Reports</p>
          <h1>明细下载</h1>
        </div>
        <button type="button" className="btn secondary" onClick={() => exportsQuery.refetch()}>
          <RefreshCw size={16} />
          刷新历史
        </button>
      </div>

      <section className="panel filter-grid">
        <label>
          <span>报表类型</span>
          <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
            {reportTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>格式</span>
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="CSV">CSV</option>
            <option value="EXCEL">Excel</option>
          </select>
        </label>
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
          <span>开始时间</span>
          <input
            type="datetime-local"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>
        <label>
          <span>结束时间</span>
          <input
            type="datetime-local"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>
        {reportType === 'INBOUND_DETAIL' ? (
          <label>
            <span>入库批次</span>
            <select value={batchId} onChange={(event) => setBatchId(event.target.value)}>
              <option value="">全部批次</option>
              {inboundBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {reportType === 'INBOUND_DETAIL' ? (
          <label>
            <span>入库状态</span>
            <select
              value={inboundStatus}
              onChange={(event) => setInboundStatus(event.target.value)}
            >
              {inboundStatusOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          <span>搜索</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="UPC / IMEI / 箱号 / 操作说明"
          />
        </label>
        {reportType === 'OUTBOUND_DETAIL' ? (
          <label>
            <span>封箱状态</span>
            <select
              value={sealedOnly ? 'SEALED' : ''}
              onChange={(event) => setSealedOnly(event.target.value === 'SEALED')}
            >
              <option value="SEALED">仅已封箱</option>
              <option value="">全部装箱明细</option>
            </select>
          </label>
        ) : null}
        {reportType === 'OUTBOUND_DETAIL' ? (
          <label>
            <span>箱子类型</span>
            <select
              value={boxSizePreset}
              onChange={(event) => setBoxSizePreset(event.target.value)}
            >
              {boxSizeOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {excelLayouts.length > 0 && format === 'EXCEL' ? (
          <label>
            <span>表格模式</span>
            <select value={exportLayout} onChange={(event) => setExportLayout(event.target.value)}>
              {excelLayouts.map((layout) => (
                <option key={layout.value} value={layout.value}>
                  {layout.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className="btn"
          disabled={hasInvalidDateRange || previewMutation.isPending}
          onClick={() => previewMutation.mutate()}
        >
          <Eye size={16} />
          预览
        </button>
        <button
          type="button"
          className="btn"
          disabled={
            !preview ||
            selectedFields.length === 0 ||
            hasInvalidDateRange ||
            createMutation.isPending
          }
          onClick={() => createMutation.mutate()}
        >
          <FileSpreadsheet size={16} />
          {selectedBoxNos.length > 0 ? `生成选中箱子导出 ${selectedBoxNos.length} 箱` : '生成导出'}
        </button>
      </section>

      {reportType === 'OUTBOUND_DETAIL' ? (
        <section className="panel report-box-picker">
          <div className="section-title compact">
            <div>
              <h2>选择箱子</h2>
              <span>
                {selectedBoxNos.length > 0
                  ? `已选 ${selectedBoxNos.length} 箱，仍按搜索和时间过滤箱内明细`
                  : '不勾选箱子时，按上方筛选条件导出'}
              </span>
            </div>
            <div className="box-picker-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={outboundBoxes.length === 0}
                onClick={selectVisibleBoxes}
              >
                <CheckSquare size={16} />
                选择当前列表
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={selectedBoxNos.length === 0}
                onClick={() => setSelectedBoxNos([])}
              >
                <X size={16} />
                清空选择
              </button>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">选择</span>
                </th>
                <th>箱子</th>
                <th>客户</th>
                <th>状态</th>
                <th>箱子类型</th>
                <th>货物</th>
                <th>上传单号</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {outboundBoxes.map((box) => (
                <tr
                  key={box.id}
                  className={selectedBoxNos.includes(box.boxNo) ? 'selected-record-row' : ''}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedBoxNos.includes(box.boxNo)}
                      onChange={() => toggleBox(box.boxNo)}
                    />
                  </td>
                  <td>
                    <strong>{box.boxName || box.boxNo}</strong>
                    <span className="mono">{box.boxNo}</span>
                  </td>
                  <td>
                    <strong>{box.customer.name}</strong>
                    <span>{box.customer.code}</span>
                  </td>
                  <td>
                    <span className={box.status === 'SEALED' ? 'badge badge-success' : 'badge'}>
                      {box.status === 'SEALED' ? '已封箱' : '未封箱'}
                    </span>
                  </td>
                  <td>{formatBoxSize(box.sizePreset, box.customSize)}</td>
                  <td>{box.itemCount} 件</td>
                  <td className="mono">{box.shippingTrackingNo || '-'}</td>
                  <td>{formatDateTime(box.sealedAt ?? box.createdAt)}</td>
                </tr>
              ))}
              {outboundBoxes.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    {outboundBoxesQuery.isFetching ? '正在加载可选箱子' : '暂无符合当前条件的箱子'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {hasInvalidDateRange ? <div className="inline-error">结束时间不能早于开始时间</div> : null}
      {message ? <div className="inline-success">{message}</div> : null}
      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}

      <div className="grid-2">
        <section className="panel data-panel">
          <div className="section-title">
            <h2>导出预览</h2>
            <span>{preview ? `预计 ${preview.estimatedRowCount} 行` : '等待预览'}</span>
          </div>
          <div className="summary-strip">
            <span>类型 {reportTypes.find((item) => item.value === reportType)?.label}</span>
            <span>格式 {format}</span>
            {(reportType === 'OUTBOUND_DETAIL' || reportType === 'INVENTORY_DETAIL') &&
            format === 'EXCEL' ? (
              <span>模式 {excelLayouts.find((item) => item.value === exportLayout)?.label}</span>
            ) : null}
            {reportType === 'INBOUND_DETAIL' ? (
              <span>
                入库状态{' '}
                {inboundStatusOptions.find((item) => item.value === inboundStatus)?.label ??
                  '全部状态'}
              </span>
            ) : null}
            <span>{preview?.shouldRunInBackground ? '需后台任务' : '可同步生成'}</span>
          </div>
          <div className="detail-list">
            <div>
              <dt>可选字段</dt>
              <dd>
                {preview?.availableFields.map((field) => (
                  <label key={field.key} className="badge" style={{ margin: '0 6px 6px 0' }}>
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(field.key)}
                      onChange={() => toggleField(field.key)}
                    />
                    {field.title}
                  </label>
                )) ?? '请先预览'}
              </dd>
            </div>
          </div>
          <PreviewTable preview={preview} selectedFields={selectedFields} />
        </section>

        <section className="panel data-panel">
          <div className="section-title">
            <h2>导出历史</h2>
            <span>共 {exports?.total ?? 0} 条</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>文件</th>
                <th>状态</th>
                <th>行数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {exports?.items.map((item) => (
                <tr key={item.id}>
                  <td className="mono">{item.fileName ?? item.id}</td>
                  <td>
                    <span className={item.status === 'COMPLETED' ? 'badge badge-success' : 'badge'}>
                      {item.status}
                    </span>
                  </td>
                  <td>{item.rowCount ?? 0}</td>
                  <td>
                    <button
                      type="button"
                      className="table-action"
                      disabled={item.status !== 'COMPLETED' || downloadMutation.isPending}
                      onClick={() => downloadMutation.mutate(item.id)}
                    >
                      <Download size={14} />
                      下载
                    </button>
                  </td>
                </tr>
              ))}
              {!exports || exports.items.length === 0 ? (
                <tr>
                  <td colSpan={4}>暂无导出记录</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  );
}

type CustomerOption = { id: string; label: string };
type ExportBatchResult = { items: InboundBatchOption[]; total: number };
type InboundBatchOption = {
  id: string;
  batchNo: string;
  label: string;
  rowCount: number;
  confirmedAt?: string | null;
};
type ExportOutboundBoxResult = { items: OutboundBoxOption[]; total: number };
type OutboundBoxOption = {
  id: string;
  boxNo: string;
  boxName?: string | null;
  sizePreset?: string | null;
  customSize?: string | null;
  shippingTrackingNo?: string | null;
  status: string;
  sealedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  customer: { id: string; code: string; name: string };
  warehouse: { id: string; code: string; name: string };
};
type ReportPreview = {
  estimatedRowCount: number;
  selectedFields: string[];
  availableFields: Array<{ key: string; title: string }>;
  sampleRows: Array<Record<string, string>>;
  shouldRunInBackground: boolean;
};
type ExportResult = { items: ReportExport[]; total: number };
type ReportExport = {
  id: string;
  status: string;
  fileName?: string | null;
  rowCount?: number | null;
};
type ReportDownload = {
  fileName: string;
  contentType: string;
  content: string;
  rowCount: number;
};

function PreviewTable({
  preview,
  selectedFields,
}: {
  preview: ReportPreview | null;
  selectedFields: string[];
}) {
  const selectedFieldSet = new Set(selectedFields);
  const columns =
    preview?.availableFields.filter((field) => selectedFieldSet.has(field.key)).slice(0, 8) ?? [];
  const sampleRows = preview?.sampleRows ?? [];

  return (
    <div className="preview-table-wrap">
      <div className="section-title compact">
        <h2>下载内容预览</h2>
        <span>{preview ? `显示前 ${sampleRows.length} 行，最多 8 列` : '请先预览'}</span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((field) => (
              <th key={field.key}>{field.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sampleRows.map((row, index) => (
            <tr key={`${index}-${columns.map((field) => row[field.key]).join('|')}`}>
              {columns.map((field) => (
                <td key={field.key}>{row[field.key] || '-'}</td>
              ))}
            </tr>
          ))}
          {!preview || columns.length === 0 || sampleRows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(columns.length, 1)}>暂无可预览数据</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function downloadReportFile(file: ReportDownload) {
  const blob = new globalThis.Blob([file.content], { type: file.contentType });
  const url = globalThis.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  window.setTimeout(() => {
    anchor.remove();
    globalThis.URL.revokeObjectURL(url);
  }, 0);
}

function toIsoDateTime(value: string) {
  if (!value) {
    return undefined;
  }

  return new Date(value).toISOString();
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatBoxSize(sizePreset?: string | null, customSize?: string | null) {
  const value = customSize || sizePreset;
  if (!value) {
    return '-';
  }
  return value.replace(/\*/g, ' x ');
}

function toUserErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
