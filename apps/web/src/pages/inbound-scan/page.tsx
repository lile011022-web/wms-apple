import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, PackageCheck, Plus, ScanLine, Trash2, Upload } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { listWarehouses } from '../../api/settings';
import { customersApi, inboundApi } from '../../api/workflow';
import { PaginationControls } from '../../components/pagination-controls';

const inboundLockStorageKey = 'wms_scan_inbound_lock';
const inboundImportTemplateHeaders = ['单号', 'upc', 'imei'];
const inboundImportRequiredFields = ['trackingNo', 'upc', 'imei'];
const inboundImportOptionalFields = ['serial'];
const inboundImportHeaderAliases: Record<string, keyof InboundImportRecord> = {
  单号: 'trackingNo',
  物流单号: 'trackingNo',
  trackingNo: 'trackingNo',
  upsTrackingNo: 'trackingNo',
  upc: 'upc',
  UPC: 'upc',
  imei: 'imei',
  IMEI: 'imei',
  serial: 'serial',
  Serial: 'serial',
};
const inboundImportTemplateRows = [
  inboundImportTemplateHeaders,
  ['1Z999AA10123456784', '194253149189', '356789012345678'],
  ['9400111899223857000000', '194253149196', '356789012345679'],
];

let inboundScanInputCache = {
  upsTrackingNo: '',
  upc: '',
  imei: '',
};

export function InboundScanPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lockedContext, setLockedContext] = useState<InboundLockContext | null>(() =>
    readInboundLock(),
  );
  const [customerId, setCustomerId] = useState(() => readInboundLock()?.customerId ?? '');
  const [warehouseId, setWarehouseId] = useState(() => readInboundLock()?.warehouseId ?? '');
  const [draft, setDraft] = useState<InboundDraft | null>(null);
  const [upsTrackingNo, setUpsTrackingNo] = useState(inboundScanInputCache.upsTrackingNo);
  const [upc, setUpc] = useState(inboundScanInputCache.upc);
  const [imei, setImei] = useState(inboundScanInputCache.imei);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [importRows, setImportRows] = useState<ImportInboundItemRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importFailedRows, setImportFailedRows] = useState<ImportFailedRow[]>([]);
  const lastAutoAddKeyRef = useRef('');

  const customersQuery = useQuery({
    queryKey: ['customer-options'],
    queryFn: () => customersApi.options(),
  });
  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ isActive: true }),
  });
  const customers = (customersQuery.data as CustomerOption[] | undefined) ?? [];
  const warehouses = warehousesQuery.data ?? [];

  useEffect(() => {
    if (!customerId && customers[0]) {
      setCustomerId(customers[0].id);
    }
    if (!warehouseId && warehouses[0]) {
      setWarehouseId(warehouses[0].id);
    }
  }, [customerId, customers, warehouseId, warehouses]);

  useEffect(() => {
    if (!lockedContext?.draftId || draft) {
      return;
    }

    let isMounted = true;

    inboundApi
      .getDraft(lockedContext.draftId)
      .then((data) => {
        if (isMounted) {
          setDraft(data as InboundDraft);
        }
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        const nextContext = {
          customerId: lockedContext.customerId,
          warehouseId: lockedContext.warehouseId,
        };
        setLockedContext(nextContext);
        writeInboundLock(nextContext);
      });

    return () => {
      isMounted = false;
    };
  }, [draft, lockedContext]);

  const isCurrentSelectionLocked =
    !!lockedContext &&
    lockedContext.customerId === customerId &&
    lockedContext.warehouseId === warehouseId;
  const isDraftOpen = draft?.status === 'DRAFT';
  const canAddCurrentScan =
    isCurrentSelectionLocked && !!upsTrackingNo.trim() && !!upc.trim() && !!imei.trim();

  const persistLockedContext = (context: InboundLockContext) => {
    setLockedContext(context);
    writeInboundLock(context);
  };

  const clearLockedContext = () => {
    setDraft(null);
    setLockedContext(null);
    removeInboundLock();
  };

  const updateScanInputCache = (values: Partial<typeof inboundScanInputCache>) => {
    inboundScanInputCache = {
      ...inboundScanInputCache,
      ...values,
    };
  };

  const clearScanInputs = () => {
    inboundScanInputCache = {
      upsTrackingNo: '',
      upc: '',
      imei: '',
    };
    lastAutoAddKeyRef.current = '';
    setUpsTrackingNo('');
    setUpc('');
    setImei('');
  };

  const ensureDraft = async () => {
    if (isDraftOpen && draft) {
      return draft;
    }
    if (!isCurrentSelectionLocked) {
      throw new Error('请先锁定客户');
    }

    const nextDraft = (await inboundApi.createDraft({
      customerId,
      warehouseId,
      notes: 'Web local test',
    })) as InboundDraft;
    setDraft(nextDraft);
    persistLockedContext({ customerId, warehouseId, draftId: nextDraft.id });
    return nextDraft;
  };

  const createDraftMutation = useMutation({
    mutationFn: () => inboundApi.createDraft({ customerId, warehouseId, notes: 'Web local test' }),
    onMutate: () => {
      setMessage('');
      setErrorMessage('');
    },
    onSuccess: (data) => {
      const nextDraft = data as InboundDraft;
      setDraft(nextDraft);
      persistLockedContext({ customerId, warehouseId, draftId: nextDraft.id });
      setMessage('已锁定客户并创建入库草稿');
    },
    onError: (error) => {
      setErrorMessage(toUserErrorMessage(error, '创建入库草稿失败'));
    },
  });
  const addItemMutation = useMutation({
    mutationFn: async () => {
      const activeDraft = await ensureDraft();
      await inboundApi.addItem(activeDraft.id, {
        upsTrackingNo: upsTrackingNo.trim() || undefined,
        upc: upc.trim(),
        imei: imei.trim(),
      });
      return inboundApi.getDraft(activeDraft.id);
    },
    onMutate: () => {
      setMessage('');
      setErrorMessage('');
    },
    onSuccess: (data) => {
      const updated = data as InboundDraft;
      setDraft(updated);
      persistLockedContext({ customerId, warehouseId, draftId: updated.id });
      clearScanInputs();
      setMessage('已添加入库明细');
    },
    onError: (error) => {
      setErrorMessage(toUserErrorMessage(error, '添加入库明细失败'));
    },
  });
  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('请先创建入库草稿');
      return inboundApi.confirmDraft(draft.id);
    },
    onMutate: () => {
      setMessage('');
      setErrorMessage('');
    },
    onSuccess: (data) => {
      const confirmedDraft = data as InboundDraft;
      setDraft(confirmedDraft);
      persistLockedContext({ customerId, warehouseId });
      setMessage('入库已确认，库存已生成');
      queryClient.invalidateQueries({ queryKey: ['inventory-customer-summary'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (error) => {
      setErrorMessage(toUserErrorMessage(error, '确认入库失败'));
    },
  });
  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      if (!draft) throw new Error('请先创建入库草稿');
      await inboundApi.removeItem(draft.id, itemId);
      return inboundApi.getDraft(draft.id);
    },
    onMutate: () => {
      setMessage('');
      setErrorMessage('');
    },
    onSuccess: (data) => {
      const updated = data as InboundDraft;
      setDraft(updated);
      persistLockedContext({ customerId, warehouseId, draftId: updated.id });
      setMessage('已删除入库明细');
    },
    onError: (error) => {
      setErrorMessage(toUserErrorMessage(error, '删除入库明细失败'));
    },
  });
  const importItemsMutation = useMutation({
    mutationFn: async () => {
      const activeDraft = await ensureDraft();
      return inboundApi.importItems(activeDraft.id, { items: importRows });
    },
    onMutate: () => {
      setMessage('');
      setErrorMessage('');
      setImportFailedRows([]);
    },
    onSuccess: (data) => {
      const result = data as ImportInboundResult;
      setDraft(result.draft);
      persistLockedContext({ customerId, warehouseId, draftId: result.draft.id });
      setImportFailedRows(result.failedRows);
      setImportRows([]);
      setImportFileName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setMessage(
        result.failedCount > 0
          ? `文件导入完成：成功 ${result.importedCount} 行，失败 ${result.failedCount} 行`
          : `文件导入完成：成功 ${result.importedCount} 行`,
      );
    },
    onError: (error) => {
      setErrorMessage(toUserErrorMessage(error, '文件导入失败'));
    },
  });

  const handleCreateDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createDraftMutation.mutate();
  };

  const handleTemplateDownload = () => {
    const content = toCsv(inboundImportTemplateRows);
    downloadTextFile('inbound-items-import-template.csv', content, 'text/csv; charset=utf-8');
  };

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const rows = parseInboundImportCsv(await file.text());
      setImportRows(rows);
      setImportFileName(file.name);
      setImportFailedRows([]);
      setMessage(`已读取 ${file.name}：${rows.length} 行待导入`);
      setErrorMessage('');
    } catch (error) {
      setImportRows([]);
      setImportFileName('');
      setImportFailedRows([]);
      setErrorMessage(toUserErrorMessage(error, '导入文件解析失败'));
    }
  };

  useEffect(() => {
    if (!canAddCurrentScan || addItemMutation.isPending) {
      return;
    }

    const scanKey = [upsTrackingNo.trim(), upc.trim(), imei.trim()].join('|');
    if (lastAutoAddKeyRef.current === scanKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastAutoAddKeyRef.current = scanKey;
      addItemMutation.mutate();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [addItemMutation, canAddCurrentScan, imei, upc, upsTrackingNo]);

  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <p>Inbound</p>
          <h1>扫码入库</h1>
        </div>
        <button type="button" className="btn secondary" onClick={handleTemplateDownload}>
          <FileDown size={16} />
          下载入库模板
        </button>
      </div>

      <form className="panel workflow-form" onSubmit={handleCreateDraft}>
        <label>
          <span>客户</span>
          <select
            value={customerId}
            onChange={(event) => {
              clearLockedContext();
              setCustomerId(event.target.value);
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
          <span>仓库</span>
          <select
            value={warehouseId}
            onChange={(event) => {
              clearLockedContext();
              setWarehouseId(event.target.value);
            }}
          >
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} / {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={
            !customerId || !warehouseId || isCurrentSelectionLocked || createDraftMutation.isPending
          }
        >
          <ScanLine size={16} />
          {isCurrentSelectionLocked ? '已锁定' : '锁定客户'}
        </button>
      </form>

      <section className="panel workflow-form">
        <label>
          <span>物流单号</span>
          <input
            value={upsTrackingNo}
            placeholder="UPS / USPS / FedEx"
            onChange={(event) => {
              setUpsTrackingNo(event.target.value);
              updateScanInputCache({ upsTrackingNo: event.target.value });
            }}
          />
        </label>
        <label>
          <span>UPC</span>
          <input
            value={upc}
            onChange={(event) => {
              setUpc(event.target.value);
              updateScanInputCache({ upc: event.target.value });
            }}
          />
        </label>
        <label>
          <span>IMEI</span>
          <input
            value={imei}
            onChange={(event) => {
              setImei(event.target.value);
              updateScanInputCache({ imei: event.target.value });
            }}
          />
        </label>
        <button
          type="button"
          disabled={!canAddCurrentScan || addItemMutation.isPending}
          onClick={() => addItemMutation.mutate()}
          title="三项填写完整后会自动加入明细，也可手动点击补提交"
        >
          <Plus size={16} />
          {addItemMutation.isPending ? '添加中' : '加入明细'}
        </button>
        <button
          type="button"
          disabled={!isDraftOpen || confirmMutation.isPending}
          onClick={() => confirmMutation.mutate()}
        >
          <PackageCheck size={16} />
          {confirmMutation.isPending ? '确认中' : '确认入库'}
        </button>
      </section>

      <section className="panel workflow-form">
        <label>
          <span>批量入库文件</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportFileChange}
          />
        </label>
        <button
          type="button"
          disabled={
            !isCurrentSelectionLocked || importRows.length === 0 || importItemsMutation.isPending
          }
          onClick={() => importItemsMutation.mutate()}
        >
          <Upload size={16} />
          {importItemsMutation.isPending ? '导入中' : '导入到当前单'}
        </button>
        {importRows.length > 0 ? (
          <strong>
            {importFileName} / {importRows.length} 行
          </strong>
        ) : null}
      </section>

      {message ? <div className="inline-success">{message}</div> : null}
      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}
      {importFailedRows.length > 0 ? (
        <div className="inline-error">
          {importFailedRows.slice(0, 5).map((row) => (
            <div key={`${row.lineNo}-${row.upc ?? ''}`}>
              第 {row.lineNo} 行：{row.message}
            </div>
          ))}
          {importFailedRows.length > 5 ? (
            <div>另有 {importFailedRows.length - 5} 行失败</div>
          ) : null}
        </div>
      ) : null}
      <DraftPanel
        draft={draft}
        removingItemId={removeItemMutation.isPending ? removeItemMutation.variables : undefined}
        onRemoveItem={(itemId) => removeItemMutation.mutate(itemId)}
      />
    </section>
  );
}

type CustomerOption = { id: string; label: string };
type InboundLockContext = {
  customerId: string;
  warehouseId: string;
  draftId?: string;
};
type InboundDraft = {
  id: string;
  batchNo: string;
  status: string;
  summary: {
    totalItems: number;
    pendingItems: number;
    confirmedItems: number;
    exceptionItems: number;
  };
  items: Array<{
    id: string;
    upsTrackingNo: string | null;
    upc: string;
    imei: string | null;
    serial?: string | null;
    status: string;
    product?: { name: string } | null;
  }>;
};
type ImportInboundItemRow = {
  upsTrackingNo?: string;
  upc: string;
  imei?: string;
  serial?: string;
};
type ImportFailedRow = {
  lineNo: number;
  upc?: string;
  upsTrackingNo?: string;
  imei?: string;
  serial?: string;
  message: string;
};
type ImportInboundResult = {
  importedCount: number;
  failedCount: number;
  failedRows: ImportFailedRow[];
  draft: InboundDraft;
};

function DraftPanel({
  draft,
  removingItemId,
  onRemoveItem,
}: {
  draft: InboundDraft | null;
  removingItemId?: string;
  onRemoveItem: (itemId: string) => void;
}) {
  const canRemoveItems = draft?.status === 'DRAFT';
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const reviewSummary = useMemo(() => buildInboundReviewSummary(draft), [draft]);
  const items = draft?.items ?? [];
  const paginatedItems = paginateItems(items, page, pageSize);

  useEffect(() => {
    setPage(1);
  }, [draft?.id, items.length]);

  return (
    <section className="panel data-panel">
      <div className="section-title">
        <h2>当前入库单</h2>
        <span>{draft ? `${draft.batchNo} / ${draft.status}` : '尚未创建'}</span>
      </div>
      <div className="inbound-review-grid">
        <SummaryMetric label="产品件数" value={reviewSummary.totalItems} />
        <SummaryMetric label="UPC 种类" value={reviewSummary.upcCount} />
        <SummaryMetric label="商品款数" value={reviewSummary.productCount} />
        <SummaryMetric label="物流单号" value={reviewSummary.trackingCount} />
        <SummaryMetric label="待确认" value={draft?.summary.pendingItems ?? 0} />
        <SummaryMetric label="异常" value={draft?.summary.exceptionItems ?? 0} tone="warning" />
      </div>
      <div className="upc-review-list">
        <div className="upc-review-heading">
          <strong>UPC 核查</strong>
          <span>每次扫描后自动统计，确认入库前按这里复核件数和商品</span>
        </div>
        {reviewSummary.upcRows.length > 0 ? (
          reviewSummary.upcRows.map((row) => (
            <div className="upc-review-row" key={row.upc}>
              <span className="mono">{row.upc}</span>
              <span>{row.productName}</span>
              <strong>{row.count} 件</strong>
            </div>
          ))
        ) : (
          <div className="upc-review-empty">暂无可核查 UPC</div>
        )}
      </div>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={items.length}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
      />
      <table className="data-table">
        <thead>
          <tr>
            <th>物流单号</th>
            <th>UPC</th>
            <th>IMEI</th>
            <th>商品</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {paginatedItems.map((item) => {
            const isRemoving = removingItemId === item.id;
            const canRemoveItem = canRemoveItems && item.status !== 'CONFIRMED';

            return (
              <tr key={item.id}>
                <td className="mono">{item.upsTrackingNo ?? '-'}</td>
                <td>{item.upc}</td>
                <td>{item.imei ?? item.serial ?? '-'}</td>
                <td>{item.product?.name ?? '-'}</td>
                <td>{item.status}</td>
                <td>
                  {canRemoveItem ? (
                    <button
                      type="button"
                      className="table-action danger"
                      title="删除明细"
                      disabled={!!removingItemId}
                      onClick={() => onRemoveItem(item.id)}
                    >
                      <Trash2 size={14} />
                      {isRemoving ? '删除中' : '删除'}
                    </button>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            );
          })}
          {items.length === 0 ? (
            <tr>
              <td colSpan={6}>暂无明细</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning';
}) {
  return (
    <div className={`summary-metric ${tone === 'warning' ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildInboundReviewSummary(draft: InboundDraft | null) {
  const items = draft?.items ?? [];
  const trackingNumbers = new Set<string>();
  const productNames = new Set<string>();
  const upcRows = new Map<string, { upc: string; productName: string; count: number }>();

  for (const item of items) {
    if (item.upsTrackingNo) {
      trackingNumbers.add(item.upsTrackingNo);
    }

    const productName = item.product?.name ?? '未匹配商品';
    productNames.add(productName);

    const existing = upcRows.get(item.upc);
    if (existing) {
      existing.count += 1;
    } else {
      upcRows.set(item.upc, {
        upc: item.upc,
        productName,
        count: 1,
      });
    }
  }

  return {
    totalItems: draft?.summary.totalItems ?? items.length,
    upcCount: upcRows.size,
    productCount: productNames.size,
    trackingCount: trackingNumbers.size,
    upcRows: Array.from(upcRows.values()).sort((left, right) =>
      left.upc.localeCompare(right.upc),
    ),
  };
}

function toUserErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function readInboundLock(): InboundLockContext | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(inboundLockStorageKey);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<InboundLockContext>;
    if (typeof parsed.customerId === 'string' && typeof parsed.warehouseId === 'string') {
      return {
        customerId: parsed.customerId,
        warehouseId: parsed.warehouseId,
        draftId: typeof parsed.draftId === 'string' ? parsed.draftId : undefined,
      };
    }
  } catch {
    removeInboundLock();
  }

  return null;
}

function writeInboundLock(context: InboundLockContext) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(inboundLockStorageKey, JSON.stringify(context));
  }
}

function removeInboundLock() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(inboundLockStorageKey);
  }
}

function parseInboundImportCsv(text: string): ImportInboundItemRow[] {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) {
    throw new Error('导入文件至少需要表头和一行入库明细');
  }

  const headers = rows[0]!.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, '').trim() : header.trim(),
  );
  const normalizedHeaders = headers.map((header) => inboundImportHeaderAliases[header]);
  const missingField = inboundImportRequiredFields.find(
    (field) => !normalizedHeaders.includes(field as keyof InboundImportRecord),
  );
  if (missingField) {
    throw new Error(`导入文件缺少表头：${toInboundImportHeaderLabel(missingField)}`);
  }
  const allowedFields = new Set([...inboundImportRequiredFields, ...inboundImportOptionalFields]);
  const unsupportedHeader = headers.find((header, index) => {
    const field = normalizedHeaders[index];
    return header && (!field || !allowedFields.has(field));
  });
  if (unsupportedHeader) {
    throw new Error(`导入文件包含不支持的表头：${unsupportedHeader}`);
  }

  return rows.slice(1).map((row, index) => {
    const record: InboundImportRecord = Object.fromEntries(
      normalizedHeaders.map((field, column) => [field, row[column] ?? '']).filter(([field]) => field),
    );
    const lineNo = index + 2;
    const upc = (record.upc ?? '').trim();
    const imei = optionalText(record.imei);
    const serial = optionalText(record.serial);

    if (!upc) {
      throw new Error(`第 ${lineNo} 行缺少 UPC`);
    }
    if (imei && serial) {
      throw new Error(`第 ${lineNo} 行 IMEI 和 Serial 只能填写一个`);
    }

    return {
      upsTrackingNo: optionalText(record.trackingNo),
      upc,
      imei,
      serial,
    };
  });
}

type InboundImportRecord = {
  trackingNo?: string;
  upc?: string;
  imei?: string;
  serial?: string;
};

function toInboundImportHeaderLabel(field: string) {
  if (field === 'trackingNo') {
    return '单号';
  }
  return field;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function optionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function toCsv(rows: string[][]) {
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')}`;
}

function escapeCsvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function downloadTextFile(fileName: string, content: string, contentType: string) {
  const blob = new globalThis.Blob([content], { type: contentType });
  const url = globalThis.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  window.setTimeout(() => {
    anchor.remove();
    globalThis.URL.revokeObjectURL(url);
  }, 0);
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
