import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { customersApi, reportsApi } from '../../api/workflow';

const reportTypes = [
  { value: 'INBOUND_DETAIL', label: '入库明细' },
  { value: 'OUTBOUND_DETAIL', label: '出库明细' },
  { value: 'INVENTORY_DETAIL', label: '库存明细' },
  { value: 'EXCEPTION_DETAIL', label: '异常明细' },
  { value: 'CUSTOMER_CHANGE_LOG', label: '客户修改日志' },
  { value: 'AUDIT_LOG', label: '审计日志' },
];

export function DetailDownloadPage() {
  const queryClient = useQueryClient();
  const [reportType, setReportType] = useState('INVENTORY_DETAIL');
  const [format, setFormat] = useState('CSV');
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const customersQuery = useQuery({
    queryKey: ['customer-options'],
    queryFn: () => customersApi.options(),
  });
  const customers = (customersQuery.data as CustomerOption[] | undefined) ?? [];

  const filters = useMemo(
    () => ({
      customerId: customerId || undefined,
      search: search || undefined,
    }),
    [customerId, search],
  );

  const exportsQuery = useQuery({
    queryKey: ['report-exports', reportType],
    queryFn: () => reportsApi.exports({ page: 1, pageSize: 30, reportType }),
  });
  const exports = exportsQuery.data as ExportResult | undefined;

  const previewMutation = useMutation({
    mutationFn: () => reportsApi.preview({ reportType, filters }),
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
    mutationFn: () =>
      reportsApi.createExport({
        reportType,
        format,
        filters,
        fields: selectedFields,
      }),
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
  }, [reportType]);

  const toggleField = (field: string) => {
    setSelectedFields((current) =>
      current.includes(field) ? current.filter((item) => item !== field) : [...current, field],
    );
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
          <span>搜索</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="UPC / IMEI / 箱号 / 操作说明"
          />
        </label>
        <button type="button" className="btn" onClick={() => previewMutation.mutate()}>
          <Eye size={16} />
          预览
        </button>
        <button
          type="button"
          className="btn"
          disabled={!preview || selectedFields.length === 0 || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          <FileSpreadsheet size={16} />
          生成导出
        </button>
      </section>

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

function toUserErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
