import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, FileDown, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { read, utils, writeFile } from 'xlsx';
import { productsApi } from '../../api/workflow';

const importTemplateHeaders = [
  'sku',
  'name',
  'brand',
  'model',
  'modelCode',
  'category',
  'color',
  'capacity',
  'requiresImei',
  'upcs',
];

const importTemplateRows = [
  importTemplateHeaders,
  [
    'IPHONE-16-PRO-256-NAT',
    'iPhone 16 Pro 256GB Natural Titanium',
    'Apple',
    'iPhone 16 Pro',
    'MG7K4LL/A',
    'iPhone',
    'Natural Titanium',
    '256GB',
    'true',
    '194253149189;194253149196',
  ],
];

export function UpcLibraryPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [modelCode, setModelCode] = useState('');
  const [upc, setUpc] = useState('');
  const [lookupUpc, setLookupUpc] = useState('');
  const [lookupResult, setLookupResult] = useState<Product | null>(null);
  const [importRows, setImportRows] = useState<ImportProductRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [updateExistingOnImport, setUpdateExistingOnImport] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(() => new Set());
  const [editingProductId, setEditingProductId] = useState('');
  const [editDraft, setEditDraft] = useState<ProductEditDraft | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const productsQuery = useQuery({
    queryKey: ['products', page, pageSize],
    queryFn: () => productsApi.list({ page, pageSize }),
  });
  const result = productsQuery.data as ProductResult | undefined;
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);
  const visibleProductIds = result?.items.map((product) => product.id) ?? [];
  const allVisibleSelected =
    visibleProductIds.length > 0 &&
    visibleProductIds.every((productId) => selectedProductIds.has(productId));
  const createMutation = useMutation({
    mutationFn: () =>
      productsApi.create({
        sku,
        name,
        model: name,
        modelCode,
        category: 'iPhone',
        brand: 'Apple',
        color: 'Black',
        capacity: '128GB',
        requiresImei: true,
        upcs: [upc],
      }),
    onSuccess: () => {
      setSku('');
      setName('');
      setModelCode('');
      setUpc('');
      setMessage('商品已新增');
      setErrorMessage('');
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '新增商品失败')),
  });
  const lookupMutation = useMutation({
    mutationFn: () => productsApi.byUpc(lookupUpc),
    onSuccess: (data) => {
      setLookupResult(data as Product);
      setErrorMessage('');
    },
    onError: (error) => {
      setLookupResult(null);
      setErrorMessage(toUserErrorMessage(error, 'UPC 查询失败'));
    },
  });
  const importMutation = useMutation({
    mutationFn: () =>
      productsApi.importProducts({
        products: importRows,
        updateExisting: updateExistingOnImport,
      }),
    onSuccess: (data) => {
      const result = data as ImportResult;
      setMessage(
        `批量导入完成：新增 ${result.importedCount} 个，覆盖更新 ${result.updatedCount} 个`,
      );
      setErrorMessage('');
      setImportRows([]);
      setImportFileName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '批量导入失败')),
  });
  const updateMutation = useMutation({
    mutationFn: async ({ product, draft }: { product: Product; draft: ProductEditDraft }) => {
      const updated = await productsApi.update(product.id, {
        sku: draft.sku,
        name: draft.name,
        brand: draft.brand,
        model: draft.model,
        modelCode: draft.modelCode,
        category: draft.category,
        color: draft.color,
        capacity: draft.capacity,
        requiresImei: draft.requiresImei,
        upcs: parseEditedUpcs(draft.upcs),
      });
      if (draft.status !== product.status) {
        return productsApi.updateStatus(product.id, { status: draft.status });
      }
      return updated;
    },
    onSuccess: () => {
      setEditingProductId('');
      setEditDraft(null);
      setMessage('商品已保存');
      setErrorMessage('');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '保存商品失败')),
  });
  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => productsApi.bulkDelete(ids),
    onSuccess: (data) => {
      const result = data as DeleteProductsResult;
      setSelectedProductIds((current) => {
        const next = new Set(current);
        for (const id of result.deletedIds) next.delete(id);
        return next;
      });
      if (result.deletedIds.includes(editingProductId)) {
        setEditingProductId('');
        setEditDraft(null);
      }
      setMessage(`已删除 ${result.deletedCount} 个商品`);
      setErrorMessage('');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '删除商品失败')),
  });

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMutation.mutate();
  };

  const handleTemplateDownload = () => {
    const workbook = utils.book_new();
    const worksheet = utils.aoa_to_sheet(importTemplateRows);
    worksheet['!cols'] = [
      { wch: 28 },
      { wch: 42 },
      { wch: 14 },
      { wch: 22 },
      { wch: 16 },
      { wch: 14 },
      { wch: 20 },
      { wch: 14 },
      { wch: 14 },
      { wch: 30 },
    ];
    utils.book_append_sheet(workbook, worksheet, '商品导入模板');
    writeFile(workbook, 'product-import-template.xlsx');
  };

  const handleExportProducts = async () => {
    setIsExporting(true);
    setMessage('');
    setErrorMessage('');

    try {
      const products: Product[] = [];
      let exportPage = 1;
      let exportTotal = 0;

      do {
        const response = (await productsApi.list({
          page: exportPage,
          pageSize: 100,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })) as unknown as ProductResult;
        products.push(...response.items);
        exportTotal = response.total;
        if (response.items.length === 0) break;
        exportPage += 1;
      } while (products.length < exportTotal);

      const reimportRows = products.map((product) => [
        product.sku,
        product.name,
        product.brand,
        product.model ?? '',
        product.modelCode ?? '',
        product.category ?? '',
        product.color ?? '',
        product.capacity ?? '',
        product.requiresImei ? 'true' : 'false',
        product.upcs.map((item) => item.upc).join(';'),
      ]);
      const detailRows = products.map((product) => [
        product.sku,
        product.name,
        product.brand,
        product.model ?? '',
        product.modelCode ?? '',
        product.category ?? '',
        product.color ?? '',
        product.capacity ?? '',
        product.requiresImei ? '是' : '否',
        product.status === 'ACTIVE' ? '启用' : '停用',
        product.upcs.map((item) => item.upc).join(';'),
      ]);
      const workbook = utils.book_new();
      const reimportWorksheet = utils.aoa_to_sheet([importTemplateHeaders, ...reimportRows]);
      reimportWorksheet['!cols'] = [
        { wch: 34 },
        { wch: 46 },
        { wch: 14 },
        { wch: 24 },
        { wch: 18 },
        { wch: 16 },
        { wch: 20 },
        { wch: 14 },
        { wch: 14 },
        { wch: 34 },
      ];
      utils.book_append_sheet(workbook, reimportWorksheet, '可重新导入');

      const detailWorksheet = utils.aoa_to_sheet([
        [
          'SKU',
          '商品名称',
          '品牌',
          '型号',
          '型号代码',
          '分类',
          '颜色',
          '容量',
          '需要 IMEI / Serial',
          '状态',
          'UPC',
        ],
        ...detailRows,
      ]);
      detailWorksheet['!cols'] = [
        { wch: 34 },
        { wch: 46 },
        { wch: 14 },
        { wch: 24 },
        { wch: 18 },
        { wch: 16 },
        { wch: 20 },
        { wch: 14 },
        { wch: 20 },
        { wch: 12 },
        { wch: 34 },
      ];
      utils.book_append_sheet(workbook, detailWorksheet, '商品明细');
      writeFile(workbook, `product-library-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setMessage(`商品数据已导出：共 ${products.length} 个商品，可直接重新导入`);
    } catch (error) {
      setErrorMessage(toUserErrorMessage(error, '商品数据导出失败'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const rows = await parseImportFile(file);
      setImportRows(rows);
      setImportFileName(file.name);
      setMessage(`已读取 ${file.name}：${rows.length} 行待导入`);
      setErrorMessage('');
    } catch (error) {
      setImportRows([]);
      setImportFileName('');
      setErrorMessage(toUserErrorMessage(error, '导入文件解析失败'));
    }
  };

  const toggleVisibleProducts = (checked: boolean) => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      for (const id of visibleProductIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const toggleProduct = (productId: string, checked: boolean) => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (checked) next.add(productId);
      else next.delete(productId);
      return next;
    });
  };

  const startEditing = (product: Product) => {
    setEditingProductId(product.id);
    setEditDraft(toProductEditDraft(product));
    setErrorMessage('');
  };

  const requestDelete = (ids: string[]) => {
    if (ids.length === 0) return;
    const confirmed = window.confirm(
      `确定删除选中的 ${ids.length} 个商品吗？已有入库、库存或异常记录的商品会被系统拒绝删除。`,
    );
    if (confirmed) deleteMutation.mutate(ids);
  };

  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <p>Product Management</p>
          <h1>商品管理</h1>
        </div>
        <div className="product-heading-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={isExporting}
            onClick={() => void handleExportProducts()}
          >
            <Download size={16} />
            {isExporting ? '导出中' : '导出全部数据'}
          </button>
          <button type="button" className="btn secondary" onClick={handleTemplateDownload}>
            <FileDown size={16} />
            下载导入模板
          </button>
        </div>
      </div>

      <form className="panel workflow-form" onSubmit={handleCreate}>
        <label>
          <span>SKU</span>
          <input
            value={sku}
            onChange={(event) => setSku(event.target.value.toUpperCase())}
            placeholder="IPHONE-LOCAL-001"
          />
        </label>
        <label>
          <span>商品名称</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="iPhone model"
          />
        </label>
        <label>
          <span>型号代码</span>
          <input
            value={modelCode}
            onChange={(event) => setModelCode(event.target.value.toUpperCase())}
            placeholder="MG7K4LL/A"
          />
        </label>
        <label>
          <span>UPC</span>
          <input value={upc} onChange={(event) => setUpc(event.target.value)} />
        </label>
        <button type="submit" disabled={!sku || !name || !upc || createMutation.isPending}>
          <Plus size={16} />
          新增商品
        </button>
      </form>

      <section className="panel workflow-form">
        <label>
          <span>批量导入文件</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={handleImportFileChange}
          />
        </label>
        <label className="product-import-update-option">
          <input
            type="checkbox"
            checked={updateExistingOnImport}
            onChange={(event) => setUpdateExistingOnImport(event.target.checked)}
          />
          <span>按 SKU 覆盖更新已有商品</span>
        </label>
        <button
          type="button"
          disabled={importRows.length === 0 || importMutation.isPending}
          onClick={() => importMutation.mutate()}
        >
          <Upload size={16} />
          {updateExistingOnImport ? '导入并覆盖更新' : '批量导入'}
        </button>
        {importRows.length > 0 ? (
          <strong>
            {importFileName} / {importRows.length} 行
          </strong>
        ) : null}
      </section>

      <section className="panel workflow-form">
        <label>
          <span>UPC 查询</span>
          <input value={lookupUpc} onChange={(event) => setLookupUpc(event.target.value)} />
        </label>
        <button type="button" onClick={() => lookupMutation.mutate()}>
          <Search size={16} />
          查询
        </button>
        {lookupResult ? (
          <strong>
            {lookupResult.sku} / {lookupResult.name}
            {lookupResult.modelCode ? ` / ${lookupResult.modelCode}` : ''}
          </strong>
        ) : null}
      </section>

      {message ? <div className="inline-success">{message}</div> : null}
      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}

      <section className="panel data-panel">
        <div className="section-title">
          <h2>商品列表</h2>
          <span>
            第 {rangeStart}-{rangeEnd} 条 / 共 {total} 条
          </span>
        </div>
        <div className="product-bulk-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={visibleProductIds.length === 0}
            onClick={() => toggleVisibleProducts(!allVisibleSelected)}
          >
            <Check size={16} />
            {allVisibleSelected ? '取消全选本页' : '全选本页'}
          </button>
          <span>已选 {selectedProductIds.size} 个</span>
          <button
            type="button"
            className="btn danger"
            disabled={selectedProductIds.size === 0 || deleteMutation.isPending}
            onClick={() => requestDelete(Array.from(selectedProductIds))}
          >
            <Trash2 size={16} />
            批量删除
          </button>
        </div>
        <div className="pagination-bar">
          <div>
            <span>每页</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>条</span>
          </div>
          <div>
            <button
              type="button"
              className="btn secondary"
              disabled={currentPage <= 1 || productsQuery.isFetching}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              上一页
            </button>
            <strong>
              {currentPage} / {totalPages}
            </strong>
            <button
              type="button"
              className="btn secondary"
              disabled={currentPage >= totalPages || productsQuery.isFetching}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              下一页
            </button>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="选择当前页全部商品"
                  checked={allVisibleSelected}
                  disabled={visibleProductIds.length === 0}
                  onChange={(event) => toggleVisibleProducts(event.target.checked)}
                />
              </th>
              <th>SKU</th>
              <th>商品</th>
              <th>型号代码</th>
              <th>UPC</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {result?.items.map((product) => {
              const isEditing = editingProductId === product.id && editDraft;
              return [
                <tr key={product.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`选择商品 ${product.sku}`}
                      checked={selectedProductIds.has(product.id)}
                      onChange={(event) => toggleProduct(product.id, event.target.checked)}
                    />
                  </td>
                  <td>{product.sku}</td>
                  <td>{product.name}</td>
                  <td>{product.modelCode ?? '-'}</td>
                  <td>{product.upcs.map((item) => item.upc).join(', ')}</td>
                  <td>{product.status === 'ACTIVE' ? '启用' : '停用'}</td>
                  <td className="product-row-actions">
                    <button
                      type="button"
                      className="table-action secondary"
                      disabled={updateMutation.isPending || deleteMutation.isPending}
                      onClick={() => startEditing(product)}
                    >
                      <Pencil size={14} />
                      编辑
                    </button>
                    <button
                      type="button"
                      className="table-action danger"
                      disabled={updateMutation.isPending || deleteMutation.isPending}
                      onClick={() => requestDelete([product.id])}
                    >
                      <Trash2 size={14} />
                      删除
                    </button>
                  </td>
                </tr>,
                isEditing ? (
                  <tr key={`${product.id}-edit`} className="product-edit-row">
                    <td colSpan={7}>
                      <ProductEditor
                        draft={editDraft}
                        isSaving={updateMutation.isPending}
                        onChange={setEditDraft}
                        onCancel={() => {
                          setEditingProductId('');
                          setEditDraft(null);
                        }}
                        onSave={() => updateMutation.mutate({ product, draft: editDraft })}
                      />
                    </td>
                  </tr>
                ) : null,
              ];
            })}
            {!result || result.items.length === 0 ? (
              <tr>
                <td colSpan={7}>暂无商品</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </section>
  );
}

function ProductEditor(props: {
  draft: ProductEditDraft;
  isSaving: boolean;
  onChange: (draft: ProductEditDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const update = <Key extends keyof ProductEditDraft>(key: Key, value: ProductEditDraft[Key]) =>
    props.onChange({ ...props.draft, [key]: value });
  const canSave =
    props.draft.sku.trim().length >= 2 &&
    props.draft.name.trim().length >= 2 &&
    parseEditedUpcs(props.draft.upcs).length > 0 &&
    !props.isSaving;

  return (
    <div className="product-edit-panel">
      <div className="product-edit-grid">
        <label>
          <span>SKU</span>
          <input value={props.draft.sku} onChange={(event) => update('sku', event.target.value)} />
        </label>
        <label>
          <span>商品名称</span>
          <input
            value={props.draft.name}
            onChange={(event) => update('name', event.target.value)}
          />
        </label>
        <label>
          <span>品牌</span>
          <input
            value={props.draft.brand}
            onChange={(event) => update('brand', event.target.value)}
          />
        </label>
        <label>
          <span>型号</span>
          <input
            value={props.draft.model}
            onChange={(event) => update('model', event.target.value)}
          />
        </label>
        <label>
          <span>型号代码</span>
          <input
            value={props.draft.modelCode}
            onChange={(event) => update('modelCode', event.target.value)}
          />
        </label>
        <label>
          <span>分类</span>
          <input
            value={props.draft.category}
            onChange={(event) => update('category', event.target.value)}
          />
        </label>
        <label>
          <span>颜色</span>
          <input
            value={props.draft.color}
            onChange={(event) => update('color', event.target.value)}
          />
        </label>
        <label>
          <span>容量</span>
          <input
            value={props.draft.capacity}
            onChange={(event) => update('capacity', event.target.value)}
          />
        </label>
        <label>
          <span>状态</span>
          <select
            value={props.draft.status}
            onChange={(event) => update('status', event.target.value as ProductEditDraft['status'])}
          >
            <option value="ACTIVE">启用</option>
            <option value="INACTIVE">停用</option>
          </select>
        </label>
        <label className="product-edit-upcs">
          <span>UPC（多个可用逗号、分号或换行分隔）</span>
          <textarea
            value={props.draft.upcs}
            onChange={(event) => update('upcs', event.target.value)}
          />
        </label>
        <label className="product-edit-checkbox">
          <input
            type="checkbox"
            checked={props.draft.requiresImei}
            onChange={(event) => update('requiresImei', event.target.checked)}
          />
          <span>入库需要 IMEI / Serial</span>
        </label>
      </div>
      <div className="product-edit-actions">
        <button
          type="button"
          className="btn secondary"
          disabled={props.isSaving}
          onClick={props.onCancel}
        >
          <X size={16} />
          取消
        </button>
        <button type="button" className="btn" disabled={!canSave} onClick={props.onSave}>
          <Check size={16} />
          {props.isSaving ? '保存中' : '保存'}
        </button>
      </div>
    </div>
  );
}

type Product = {
  id: string;
  sku: string;
  brand: string;
  name: string;
  model?: string | null;
  modelCode?: string | null;
  category?: string | null;
  color?: string | null;
  capacity?: string | null;
  requiresImei: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  upcs: Array<{ upc: string }>;
};
type ProductEditDraft = {
  sku: string;
  name: string;
  brand: string;
  model: string;
  modelCode: string;
  category: string;
  color: string;
  capacity: string;
  requiresImei: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  upcs: string;
};
type ProductResult = {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
};
type ImportProductRow = {
  sku: string;
  name: string;
  brand?: string;
  model?: string;
  modelCode?: string;
  category?: string;
  color?: string;
  capacity?: string;
  requiresImei?: boolean;
  upcs: string[];
};
type ImportResult = {
  importedCount: number;
  updatedCount: number;
  items: Product[];
};
type DeleteProductsResult = {
  deletedCount: number;
  deletedIds: string[];
};

function toProductEditDraft(product: Product): ProductEditDraft {
  return {
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    model: product.model ?? '',
    modelCode: product.modelCode ?? '',
    category: product.category ?? '',
    color: product.color ?? '',
    capacity: product.capacity ?? '',
    requiresImei: product.requiresImei,
    status: product.status,
    upcs: product.upcs.map((item) => item.upc).join('\n'),
  };
}

function parseEditedUpcs(value: string) {
  return [
    ...new Set(
      value
        .split(/[,，;；\n\r\t ]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

async function parseImportFile(file: File): Promise<ImportProductRow[]> {
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.xlsx')) {
    const workbook = read(await file.arrayBuffer(), { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
    if (!worksheet) {
      throw new Error('导入文件没有可读取的工作表');
    }
    const rows = utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    return parseImportRows(rows);
  }

  if (fileName.endsWith('.csv')) {
    return parseImportRows(parseCsv(await file.text()));
  }

  throw new Error('导入文件仅支持 .xlsx 或 .csv');
}

function parseImportRows(inputRows: string[][]): ImportProductRow[] {
  const rows = inputRows.filter((row) => row.some((cell) => String(cell).trim()));
  if (rows.length < 2) {
    throw new Error('导入文件至少需要表头和一行商品数据');
  }

  const headers = rows[0]!.map((header, index) =>
    index === 0
      ? String(header)
          .replace(/^\uFEFF/, '')
          .trim()
      : String(header).trim(),
  );
  const missingHeader = importTemplateHeaders.find((header) => !headers.includes(header));
  if (missingHeader) {
    throw new Error(`导入文件缺少表头：${missingHeader}`);
  }

  return rows.slice(1).map((row, index) => {
    const record: Record<string, string> = Object.fromEntries(
      headers.map((header, column) => [header, String(row[column] ?? '')]),
    );
    const lineNo = index + 2;
    const sku = (record.sku ?? '').trim().toUpperCase();
    const name = (record.name ?? '').trim();
    const upcs = (record.upcs ?? '')
      .split(/[;；]/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!sku) {
      throw new Error(`第 ${lineNo} 行缺少 SKU`);
    }
    if (!name) {
      throw new Error(`第 ${lineNo} 行缺少商品名称`);
    }
    if (upcs.length === 0) {
      throw new Error(`第 ${lineNo} 行至少需要一个 UPC`);
    }

    return {
      sku,
      name,
      brand: optionalText(record.brand),
      model: optionalText(record.model),
      modelCode: optionalText(record.modelCode)?.toUpperCase(),
      category: optionalText(record.category),
      color: optionalText(record.color),
      capacity: optionalText(record.capacity),
      requiresImei: parseOptionalBoolean(record.requiresImei),
      upcs,
    };
  });
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

function parseOptionalBoolean(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (['true', 'yes', 'y', '1', '是'].includes(normalized)) {
    return true;
  }
  if (['false', 'no', 'n', '0', '否'].includes(normalized)) {
    return false;
  }
  throw new Error(`requiresImei 只能填写 true/false、yes/no、1/0 或 是/否`);
}

function optionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function toUserErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
