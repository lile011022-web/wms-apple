import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Plus, Search, Upload } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import { productsApi } from '../../api/workflow';

const importTemplateHeaders = [
  'sku',
  'name',
  'brand',
  'model',
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
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [upc, setUpc] = useState('');
  const [lookupUpc, setLookupUpc] = useState('');
  const [lookupResult, setLookupResult] = useState<Product | null>(null);
  const [importRows, setImportRows] = useState<ImportProductRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.list({ page: 1, pageSize: 50 }),
  });
  const result = productsQuery.data as ProductResult | undefined;
  const createMutation = useMutation({
    mutationFn: () =>
      productsApi.create({
        sku,
        name,
        model: name,
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
      setUpc('');
      setMessage('商品已新增');
      setErrorMessage('');
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
    mutationFn: () => productsApi.importProducts({ products: importRows }),
    onSuccess: (data) => {
      const result = data as ImportResult;
      setMessage(`批量导入完成：成功导入 ${result.importedCount} 个商品`);
      setErrorMessage('');
      setImportRows([]);
      setImportFileName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '批量导入失败')),
  });

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMutation.mutate();
  };

  const handleTemplateDownload = () => {
    const content = toCsv(importTemplateRows);
    downloadTextFile('upc-product-import-template.csv', content, 'text/csv; charset=utf-8');
  };

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const rows = parseImportCsv(await file.text());
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

  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <p>Product Catalog</p>
          <h1>UPC 商品库</h1>
        </div>
        <button type="button" className="btn secondary" onClick={handleTemplateDownload}>
          <FileDown size={16} />
          下载导入模板
        </button>
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
            accept=".csv,text/csv"
            onChange={handleImportFileChange}
          />
        </label>
        <button
          type="button"
          disabled={importRows.length === 0 || importMutation.isPending}
          onClick={() => importMutation.mutate()}
        >
          <Upload size={16} />
          批量导入
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
          </strong>
        ) : null}
      </section>

      {message ? <div className="inline-success">{message}</div> : null}
      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}

      <section className="panel data-panel">
        <div className="section-title">
          <h2>商品列表</h2>
          <span>共 {result?.total ?? 0} 条</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>商品</th>
              <th>UPC</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {result?.items.map((product) => (
              <tr key={product.id}>
                <td>{product.sku}</td>
                <td>{product.name}</td>
                <td>{product.upcs.map((item) => item.upc).join(', ')}</td>
                <td>{product.status}</td>
              </tr>
            ))}
            {!result || result.items.length === 0 ? (
              <tr>
                <td colSpan={4}>暂无商品</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </section>
  );
}

type Product = {
  id: string;
  sku: string;
  name: string;
  status: string;
  upcs: Array<{ upc: string }>;
};
type ProductResult = {
  items: Product[];
  total: number;
};
type ImportProductRow = {
  sku: string;
  name: string;
  brand?: string;
  model?: string;
  category?: string;
  color?: string;
  capacity?: string;
  requiresImei?: boolean;
  upcs: string[];
};
type ImportResult = {
  importedCount: number;
  items: Product[];
};

function parseImportCsv(text: string): ImportProductRow[] {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) {
    throw new Error('导入文件至少需要表头和一行商品数据');
  }

  const headers = rows[0]!.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, '').trim() : header.trim(),
  );
  const missingHeader = importTemplateHeaders.find((header) => !headers.includes(header));
  if (missingHeader) {
    throw new Error(`导入文件缺少表头：${missingHeader}`);
  }

  return rows.slice(1).map((row, index) => {
    const record: Record<string, string> = Object.fromEntries(
      headers.map((header, column) => [header, row[column] ?? '']),
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

function toUserErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
