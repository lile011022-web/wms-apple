import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, FileSpreadsheet, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getSystemSettings, listWarehouses } from '../../api/settings';
import { customersApi, inventoryApi, reportsApi } from '../../api/workflow';
import { HorizontalScrollControl } from '../../components/horizontal-scroll-control';
import { PaginationControls } from '../../components/pagination-controls';
import { selectDefaultWarehouseId } from '../../utils/default-warehouse';

export function CustomerInventoryPage() {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [summaryPage, setSummaryPage] = useState(1);
  const [summaryPageSize, setSummaryPageSize] = useState(20);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(50);
  const [detailSearch, setDetailSearch] = useState('');
  const [activityDateFrom, setActivityDateFrom] = useState(() => toDateTimeInputValue(new Date()));
  const [activityDateTo, setActivityDateTo] = useState(() => toDateTimeInputValue(endOfToday()));
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>('');
  const [activeMetricLabel, setActiveMetricLabel] = useState('库存总数');
  const [selectedInventoryItemIds, setSelectedInventoryItemIds] = useState<string[]>([]);
  const detailTableRef = useRef<HTMLDivElement | null>(null);
  const customersQuery = useQuery({
    queryKey: ['customer-options'],
    queryFn: () => customersApi.options(),
  });
  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'active'],
    queryFn: () => listWarehouses({ isActive: true }),
  });
  const settingsQuery = useQuery({
    queryKey: ['system-settings'],
    queryFn: getSystemSettings,
  });
  const customers = (customersQuery.data as CustomerOption[] | undefined) ?? [];
  const warehouses = warehousesQuery.data ?? [];

  useEffect(() => {
    if (!warehouseId) {
      const defaultWarehouseId = selectDefaultWarehouseId(warehouses, settingsQuery.data);
      if (defaultWarehouseId) {
        setWarehouseId(defaultWarehouseId);
      }
    }
  }, [settingsQuery.data, warehouseId, warehouses]);

  const customerSummaryQuery = useQuery({
    queryKey: [
      'inventory-customer-summary',
      customerId,
      warehouseId,
      activityDateFrom,
      activityDateTo,
    ],
    queryFn: () =>
      inventoryApi.customerSummary({
        customerId: customerId || undefined,
        warehouseId,
        dateFrom: toIsoDateTime(activityDateFrom),
        dateTo: toIsoDateTime(activityDateTo),
      }),
  });
  const customerSummary = customerSummaryQuery.data as CustomerInventorySummary | undefined;

  const productSummaryQuery = useQuery({
    queryKey: [
      'inventory-products',
      customerId,
      warehouseId,
      activityDateFrom,
      activityDateTo,
      statusFilter,
      summaryPage,
      summaryPageSize,
    ],
    queryFn: () =>
      inventoryApi.products({
        customerId: customerId || undefined,
        warehouseId,
        status: statusFilter || undefined,
        dateFrom: toIsoDateTime(activityDateFrom),
        dateTo: toIsoDateTime(activityDateTo),
        page: summaryPage,
        pageSize: summaryPageSize,
      }),
  });
  const productSummary = productSummaryQuery.data as ProductSummaryResult | undefined;

  const inventoryQuery = useQuery({
    queryKey: [
      'inventory-items',
      customerId,
      warehouseId,
      activityDateFrom,
      activityDateTo,
      statusFilter,
      detailSearch,
      detailPage,
      detailPageSize,
    ],
    queryFn: () =>
      inventoryApi.items({
        customerId: customerId || undefined,
        warehouseId,
        status: statusFilter || undefined,
        dateFrom: toIsoDateTime(activityDateFrom),
        dateTo: toIsoDateTime(activityDateTo),
        search: detailSearch.trim() || undefined,
        page: detailPage,
        pageSize: detailPageSize,
      }),
  });
  const inventory = inventoryQuery.data as InventoryResult | undefined;
  const skuSectionTitle = getSkuSectionTitle(activeMetricLabel);
  const detailSectionTitle = getDetailSectionTitle(activeMetricLabel);
  const currentPageInventoryItemIds = customerId
    ? (inventory?.items.map((item) => item.id) ?? [])
    : [];
  const selectedDetailsOnCurrentPage = currentPageInventoryItemIds.filter((id) =>
    selectedInventoryItemIds.includes(id),
  );
  const isCurrentDetailPageSelected =
    currentPageInventoryItemIds.length > 0 &&
    selectedDetailsOnCurrentPage.length === currentPageInventoryItemIds.length;

  const isFetching =
    customerSummaryQuery.isFetching || productSummaryQuery.isFetching || inventoryQuery.isFetching;
  const deleteInventoryItemsMutation = useMutation({
    mutationFn: (itemIds: string[]) =>
      inventoryApi.deleteItems({
        customerId,
        warehouseId: warehouseId || undefined,
        itemIds,
      }),
    onSuccess: async () => {
      setSelectedInventoryItemIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory-customer-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-products'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-items'] }),
      ]);
    },
    onError: (error) => {
      window.alert(error instanceof Error ? error.message : '删除库存明细失败');
    },
  });
  const deleteInventoryProductMutation = useMutation({
    mutationFn: (row: ProductSummaryItem) =>
      inventoryApi.deleteProducts({
        customerId,
        warehouseId: warehouseId || undefined,
        productIds: [row.product.id],
        status: statusFilter || undefined,
        dateFrom: toIsoDateTime(activityDateFrom),
        dateTo: toIsoDateTime(activityDateTo),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory-customer-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-products'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-items'] }),
      ]);
    },
    onError: (error) => {
      window.alert(error instanceof Error ? error.message : '删除 SKU 库存失败');
    },
  });
  const downloadInventoryDetailMutation = useMutation({
    mutationFn: async () => {
      const created = (await reportsApi.createExport({
        reportType: 'INVENTORY_DETAIL',
        format: 'EXCEL',
        filters: {
          customerId: customerId || undefined,
          warehouseId: warehouseId || undefined,
          inventoryStatus: statusFilter || undefined,
          dateFrom: toIsoDateTime(activityDateFrom),
          dateTo: toIsoDateTime(activityDateTo),
          search: detailSearch.trim() || undefined,
        },
        fields: [
          'upsTrackingNo',
          'customerCode',
          'customerName',
          'inboundBatchNo',
          'outboundBoxNo',
          'imei',
          'upc',
          'productName',
          'modelCode',
          'receivedAt',
          'status',
        ],
      })) as ReportExport;
      return reportsApi.download(created.id) as Promise<ReportDownload>;
    },
    onSuccess: (file) => {
      downloadReportFile(file);
    },
    onError: (error) => {
      window.alert(error instanceof Error ? error.message : '导出库存明细失败');
    },
  });

  useEffect(() => {
    setSelectedInventoryItemIds([]);
  }, [
    customerId,
    warehouseId,
    detailPage,
    detailPageSize,
    detailSearch,
    activityDateFrom,
    activityDateTo,
    statusFilter,
  ]);

  const applyMetricFilter = (label: string, status: InventoryStatusFilter) => {
    setActiveMetricLabel(label);
    setStatusFilter(status);
    setSummaryPage(1);
    setDetailPage(1);
    setDetailSearch('');
    window.setTimeout(() => {
      detailTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const toggleCurrentPageInventoryItems = () => {
    setSelectedInventoryItemIds((current) => {
      if (isCurrentDetailPageSelected) {
        return current.filter((id) => !currentPageInventoryItemIds.includes(id));
      }
      return [...new Set([...current, ...currentPageInventoryItemIds])];
    });
  };

  const toggleInventoryItem = (itemId: string) => {
    setSelectedInventoryItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    );
  };

  const deleteInventoryItems = (itemIds: string[], label: string) => {
    const normalizedItemIds = [...new Set(itemIds)].filter(Boolean);
    if (!normalizedItemIds.length || deleteInventoryItemsMutation.isPending) {
      return;
    }
    const confirmed = window.confirm(
      `确认删除${label}的库存明细？\n\n将删除 ${normalizedItemIds.length} 条当前客户/仓库的库存明细，不会删除 UPC、SKU 或商品资料。已装箱/已出库明细会被系统拦截。`,
    );
    if (!confirmed) {
      return;
    }
    deleteInventoryItemsMutation.mutate(normalizedItemIds);
  };

  const deleteInventoryProduct = (row: ProductSummaryItem) => {
    if (!customerId || deleteInventoryProductMutation.isPending) {
      return;
    }
    const confirmed = window.confirm(
      `确认删除这个 SKU 的当前库存？\n\n客户：${formatCustomerLabel(row.customer)}\nSKU：${row.product.sku}\n数量：${row.summary.totalQuantity}\n\n系统只会删除当前客户、仓库、日期和状态筛选下的库存行，不会删除 UPC、SKU 或商品资料。已装箱/已出库明细会被系统拦截。`,
    );
    if (!confirmed) {
      return;
    }
    deleteInventoryProductMutation.mutate(row);
  };

  return (
    <section className="page-frame">
      <div className="page-heading">
        <p>Inventory</p>
        <h1>客户库存</h1>
      </div>

      <section className="panel toolbar-panel">
        <label>
          <span>客户</span>
          <select
            value={customerId}
            onChange={(event) => {
              setCustomerId(event.target.value);
              setSummaryPage(1);
              setDetailPage(1);
            }}
          >
            <option value="">全部客户</option>
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
              setWarehouseId(event.target.value);
              setSummaryPage(1);
              setDetailPage(1);
            }}
          >
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} - {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            customerSummaryQuery.refetch();
            productSummaryQuery.refetch();
            inventoryQuery.refetch();
          }}
        >
          <RefreshCw size={16} />
          {isFetching ? '刷新中' : '刷新库存'}
        </button>
      </section>

      <section className="panel inventory-date-panel">
        <div className="inventory-date-title">
          <CalendarDays size={18} />
          <div>
            <h2>按日期定位</h2>
            <span>{formatTimeRangeLabel(activityDateFrom, activityDateTo, activeMetricLabel)}</span>
          </div>
        </div>
        <div className="inventory-date-actions">
          <label>
            <span>开始时间</span>
            <input
              type="datetime-local"
              value={activityDateFrom}
              onChange={(event) => {
                setActivityDateFrom(event.target.value);
                setSummaryPage(1);
                setDetailPage(1);
              }}
            />
          </label>
          <label>
            <span>结束时间</span>
            <input
              type="datetime-local"
              value={activityDateTo}
              onChange={(event) => {
                setActivityDateTo(event.target.value);
                setSummaryPage(1);
                setDetailPage(1);
              }}
            />
          </label>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setActivityDateFrom(toDateTimeInputValue(new Date()));
              setActivityDateTo(toDateTimeInputValue(endOfToday()));
              setSummaryPage(1);
              setDetailPage(1);
            }}
          >
            今天
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setActivityDateFrom('');
              setActivityDateTo('');
              setSummaryPage(1);
              setDetailPage(1);
            }}
          >
            <X size={16} />
            全部日期
          </button>
        </div>
      </section>

      <section className="panel data-panel">
        <div className="section-title">
          <h2>库存汇总</h2>
          <span>
            {customerSummaryQuery.isFetching
              ? '正在读取'
              : activityDateFrom || activityDateTo
                ? customerId
                  ? '按当前客户和日期统计'
                  : '按全部客户和日期统计'
                : customerId
                  ? '按当前客户统计'
                  : '按全部客户统计'}
          </span>
        </div>
        <div className="inbound-review-grid">
          <SummaryMetric
            label="库存总数"
            value={customerSummary?.totalQuantity ?? 0}
            active={statusFilter === '' && activeMetricLabel === '库存总数'}
            onClick={() => applyMetricFilter('库存总数', '')}
          />
          <SummaryMetric
            label="SKU 款数"
            value={customerSummary?.skuCount ?? 0}
            active={statusFilter === '' && activeMetricLabel === 'SKU 款数'}
            onClick={() => applyMetricFilter('SKU 款数', '')}
          />
          <SummaryMetric
            label="在库"
            value={customerSummary?.inStockQuantity ?? 0}
            active={statusFilter === 'IN_STOCK' && activeMetricLabel === '在库'}
            onClick={() => applyMetricFilter('在库', 'IN_STOCK')}
          />
          <SummaryMetric
            label="可出库"
            value={customerSummary?.availableForOutboundQuantity ?? 0}
            active={statusFilter === 'IN_STOCK' && activeMetricLabel === '可出库'}
            onClick={() => applyMetricFilter('可出库', 'IN_STOCK')}
          />
          <SummaryMetric
            label="已装箱"
            value={customerSummary?.packedQuantity ?? 0}
            active={statusFilter === 'PACKED' && activeMetricLabel === '已装箱'}
            onClick={() => applyMetricFilter('已装箱', 'PACKED')}
          />
          <SummaryMetric
            label="已出库"
            value={customerSummary?.outboundQuantity ?? 0}
            active={statusFilter === 'OUTBOUND' && activeMetricLabel === '已出库'}
            onClick={() => applyMetricFilter('已出库', 'OUTBOUND')}
          />
          <SummaryMetric
            label="异常"
            value={customerSummary?.exceptionQuantity ?? 0}
            tone="warning"
            active={statusFilter === 'EXCEPTION' && activeMetricLabel === '异常'}
            onClick={() => applyMetricFilter('异常', 'EXCEPTION')}
          />
          <SummaryMetric
            label="作废"
            value={customerSummary?.voidedQuantity ?? 0}
            active={statusFilter === 'VOIDED' && activeMetricLabel === '作废'}
            onClick={() => applyMetricFilter('作废', 'VOIDED')}
          />
        </div>
      </section>

      <section className="panel data-panel">
        <div className="section-title inventory-section-title">
          <div>
            <h2>{skuSectionTitle}</h2>
            <span>
              {formatCompactTimeRange(activityDateFrom, activityDateTo)}
              {activeMetricLabel}：共 {productSummary?.total ?? 0} 款
            </span>
          </div>
        </div>
        <PaginationControls
          page={summaryPage}
          pageSize={summaryPageSize}
          total={productSummary?.total ?? 0}
          isFetching={productSummaryQuery.isFetching}
          onPageChange={setSummaryPage}
          onPageSizeChange={(nextPageSize) => {
            setSummaryPageSize(nextPageSize);
            setSummaryPage(1);
          }}
        />
        <table className="data-table">
          <thead>
            <tr>
              <th>客户</th>
              <th>UPC</th>
              <th>SKU</th>
              <th>商品</th>
              <th>型号代码</th>
              <th>物流单号数</th>
              <th>总数</th>
              <th>在库</th>
              <th>可出库</th>
              <th>已装箱</th>
              <th>已出库</th>
              <th>异常</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {productSummary?.items.map((row) => (
              <tr key={`${row.customer?.id ?? 'all'}:${row.product.id}`}>
                <td>
                  <strong>{formatCustomerLabel(row.customer)}</strong>
                </td>
                <td className="mono">{row.product.upcs.join(', ') || '-'}</td>
                <td className="mono">{row.product.sku}</td>
                <td>{row.product.name}</td>
                <td className="mono">{row.product.modelCode ?? '-'}</td>
                <td>{row.trackingNumberCount}</td>
                <td>{row.summary.totalQuantity}</td>
                <td>{row.summary.inStockQuantity}</td>
                <td>{row.summary.availableForOutboundQuantity}</td>
                <td>{row.summary.packedQuantity}</td>
                <td>{row.summary.outboundQuantity}</td>
                <td>{row.summary.exceptionQuantity}</td>
                <td>
                  <button
                    type="button"
                    className="table-action danger"
                    disabled={!customerId || deleteInventoryProductMutation.isPending}
                    onClick={() => deleteInventoryProduct(row)}
                    title={customerId ? '删除这个 SKU 的当前库存' : '请选择客户后删除'}
                  >
                    <Trash2 size={15} />
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {!productSummary || productSummary.items.length === 0 ? (
              <tr>
                <td colSpan={13}>暂无 SKU 汇总</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="panel data-panel">
        <div className="section-title inventory-section-title">
          <div>
            <h2>{detailSectionTitle}</h2>
            <span>
              {formatCompactTimeRange(activityDateFrom, activityDateTo)}
              {activeMetricLabel}：共 {inventory?.total ?? 0} 条，已选{' '}
              {selectedInventoryItemIds.length} 条
            </span>
          </div>
          <div className="inventory-bulk-actions">
            <button
              type="button"
              className="btn danger"
              disabled={
                !customerId ||
                !selectedInventoryItemIds.length ||
                deleteInventoryItemsMutation.isPending
              }
              onClick={() => deleteInventoryItems(selectedInventoryItemIds, '选中')}
            >
              <Trash2 size={16} />
              删除选中
            </button>
            <button
              type="button"
              className="btn danger"
              disabled={
                !customerId ||
                !currentPageInventoryItemIds.length ||
                deleteInventoryItemsMutation.isPending
              }
              onClick={() => deleteInventoryItems(currentPageInventoryItemIds, '当前分页')}
            >
              <Trash2 size={16} />
              删除当前分页
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={
                !inventory?.total ||
                inventoryQuery.isFetching ||
                downloadInventoryDetailMutation.isPending
              }
              onClick={() => downloadInventoryDetailMutation.mutate()}
            >
              <FileSpreadsheet size={16} />
              {downloadInventoryDetailMutation.isPending ? '导出中' : '导出明细'}
            </button>
          </div>
        </div>
        <PaginationControls
          page={detailPage}
          pageSize={detailPageSize}
          total={inventory?.total ?? 0}
          isFetching={inventoryQuery.isFetching}
          onPageChange={setDetailPage}
          onPageSizeChange={(nextPageSize) => {
            setDetailPageSize(nextPageSize);
            setDetailPage(1);
          }}
        >
          <label className="outbound-search-control inventory-search-control">
            <Search size={16} />
            <input
              value={detailSearch}
              onChange={(event) => {
                setDetailSearch(event.target.value);
                setDetailPage(1);
              }}
              placeholder="搜索单号、入库单、箱号、IMEI、UPC 或商品"
            />
          </label>
        </PaginationControls>
        <div ref={detailTableRef} className="inventory-detail-table-wrap">
          <table className="data-table inventory-detail-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={isCurrentDetailPageSelected}
                    disabled={!customerId || !currentPageInventoryItemIds.length}
                    onChange={toggleCurrentPageInventoryItems}
                    aria-label="选择当前分页库存明细"
                  />
                </th>
                <th>单号</th>
                <th>客户</th>
                <th>入库单号</th>
                <th>出单号/箱号</th>
                <th>IMEI</th>
                <th>UPC</th>
                <th>商品</th>
                <th>型号代码</th>
                <th>扫描时间</th>
                <th>入库时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {inventory?.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedInventoryItemIds.includes(item.id)}
                      disabled={!customerId}
                      onChange={() => toggleInventoryItem(item.id)}
                      aria-label={`选择库存明细 ${item.imei ?? item.serial ?? item.upc}`}
                    />
                  </td>
                  <td className="mono">{item.upsTrackingNo ?? '-'}</td>
                  <td>{formatCustomerLabel(item.customer)}</td>
                  <td className="mono">{item.inboundBatch?.batchNo ?? '-'}</td>
                  <td className="mono">{item.latestOutboundBox?.boxNo ?? '-'}</td>
                  <td className="mono">{item.imei ?? item.serial}</td>
                  <td className="mono">{item.upc}</td>
                  <td>{item.product.name}</td>
                  <td className="mono">{item.product.modelCode ?? '-'}</td>
                  <td>
                    <TimeCell value={item.inboundItem?.scannedAt ?? null} />
                  </td>
                  <td>
                    <TimeCell value={item.receivedAt} />
                  </td>
                  <td>
                    <span className={inventoryStatusClass(item.status)}>{item.status}</span>
                  </td>
                </tr>
              ))}
              {!inventory || inventory.items.length === 0 ? (
                <tr>
                  <td colSpan={12}>暂无库存</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <HorizontalScrollControl targetRef={detailTableRef} />
      </section>
    </section>
  );
}

type CustomerOption = { id: string; label: string };
type InventoryStatusFilter = '' | 'IN_STOCK' | 'PACKED' | 'OUTBOUND' | 'EXCEPTION' | 'VOIDED';
type CustomerInventorySummary = {
  totalQuantity: number;
  skuCount: number;
  inStockQuantity: number;
  packedQuantity: number;
  outboundQuantity: number;
  exceptionQuantity: number;
  voidedQuantity: number;
  availableForOutboundQuantity: number;
};
type ProductSummaryResult = {
  items: ProductSummaryItem[];
  total: number;
  page: number;
  pageSize: number;
};
type ProductSummaryItem = {
  customer?: { id: string; code: string; name: string } | null;
  product: {
    id: string;
    sku: string;
    name: string;
    modelCode?: string | null;
    upcs: string[];
  };
  summary: {
    totalQuantity: number;
    inStockQuantity: number;
    packedQuantity: number;
    outboundQuantity: number;
    exceptionQuantity: number;
    availableForOutboundQuantity: number;
  };
  trackingNumberCount: number;
};
type InventoryResult = {
  items: InventoryItem[];
  total: number;
  page: number;
  pageSize: number;
};
type InventoryItem = {
  id: string;
  upc: string;
  imei: string | null;
  serial: string | null;
  status: string;
  availableForOutbound: boolean;
  upsTrackingNo: string | null;
  receivedAt: string | null;
  customer?: { id: string; code: string; name: string } | null;
  product: { name: string; modelCode?: string | null };
  inboundItem?: { scannedAt?: string | null } | null;
  inboundBatch?: { batchNo: string } | null;
  latestOutboundBox?: { boxNo: string } | null;
};
type ReportExport = {
  id: string;
  status: string;
};
type ReportDownload = {
  fileName: string;
  contentType: string;
  content: string;
  rowCount: number;
};

function formatCustomerLabel(customer?: { code?: string | null; name?: string | null } | null) {
  if (!customer) return '-';
  return [customer.code, customer.name].filter(Boolean).join(' - ') || '-';
}

function SummaryMetric({
  label,
  value,
  tone = 'default',
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning';
  active?: boolean;
  onClick?: () => void;
}) {
  const className = [
    'summary-metric',
    tone === 'warning' ? 'warning' : '',
    onClick ? 'metric-button' : '',
    active ? 'active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        <span>{label}</span>
        <strong>{value}</strong>
      </button>
    );
  }

  return (
    <div className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function toDateTimeInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function toIsoDateTime(value: string) {
  if (!value) {
    return undefined;
  }
  return new Date(value).toISOString();
}

function formatTimeRangeLabel(dateFrom: string, dateTo: string, metricLabel: string) {
  const range = formatCompactTimeRange(dateFrom, dateTo).replace(/，$/, '');
  return range ? `${range} 的 ${metricLabel} 数据` : `全部时间的 ${metricLabel} 数据`;
}

function formatCompactTimeRange(dateFrom: string, dateTo: string) {
  if (dateFrom && dateTo) {
    return `${dateFrom.replace('T', ' ')} 至 ${dateTo.replace('T', ' ')}，`;
  }
  if (dateFrom) {
    return `${dateFrom.replace('T', ' ')} 之后，`;
  }
  if (dateTo) {
    return `${dateTo.replace('T', ' ')} 之前，`;
  }
  return '';
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

function getSkuSectionTitle(metricLabel: string) {
  if (metricLabel === '库存总数' || metricLabel === 'SKU 款数') {
    return 'SKU 汇总明细';
  }
  return `${metricLabel} SKU 汇总`;
}

function getDetailSectionTitle(metricLabel: string) {
  if (metricLabel === '库存总数' || metricLabel === 'SKU 款数') {
    return '客户库存明细';
  }
  return `${metricLabel}明细`;
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

function inventoryStatusClass(status: string) {
  if (status === 'IN_STOCK') return 'badge badge-success';
  if (status === 'EXCEPTION' || status === 'VOIDED') return 'badge badge-danger';
  return 'badge badge-info';
}
