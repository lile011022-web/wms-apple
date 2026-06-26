import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getSystemSettings, listWarehouses } from '../../api/settings';
import { customersApi, inventoryApi } from '../../api/workflow';
import { HorizontalScrollControl } from '../../components/horizontal-scroll-control';
import { PaginationControls } from '../../components/pagination-controls';
import { selectDefaultWarehouseId } from '../../utils/default-warehouse';

export function CustomerInventoryPage() {
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [summaryPage, setSummaryPage] = useState(1);
  const [summaryPageSize, setSummaryPageSize] = useState(20);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(50);
  const [detailSearch, setDetailSearch] = useState('');
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
    if (!customerId && customers[0]) {
      setCustomerId(customers[0].id);
    }
    if (!warehouseId) {
      const defaultWarehouseId = selectDefaultWarehouseId(warehouses, settingsQuery.data);
      if (defaultWarehouseId) {
        setWarehouseId(defaultWarehouseId);
      }
    }
  }, [customerId, customers, settingsQuery.data, warehouseId, warehouses]);

  const customerSummaryQuery = useQuery({
    queryKey: ['inventory-customer-summary', customerId, warehouseId],
    queryFn: () => inventoryApi.customerSummary({ customerId, warehouseId }),
    enabled: Boolean(customerId),
  });
  const customerSummary = customerSummaryQuery.data as CustomerInventorySummary | undefined;

  const productSummaryQuery = useQuery({
    queryKey: ['inventory-products', customerId, warehouseId, summaryPage, summaryPageSize],
    queryFn: () =>
      inventoryApi.products({
        customerId,
        warehouseId,
        page: summaryPage,
        pageSize: summaryPageSize,
      }),
    enabled: Boolean(customerId),
  });
  const productSummary = productSummaryQuery.data as ProductSummaryResult | undefined;

  const inventoryQuery = useQuery({
    queryKey: [
      'inventory-items',
      customerId,
      warehouseId,
      detailSearch,
      detailPage,
      detailPageSize,
    ],
    queryFn: () =>
      inventoryApi.items({
        customerId,
        warehouseId,
        search: detailSearch.trim() || undefined,
        page: detailPage,
        pageSize: detailPageSize,
      }),
    enabled: Boolean(customerId),
  });
  const inventory = inventoryQuery.data as InventoryResult | undefined;

  const isFetching =
    customerSummaryQuery.isFetching || productSummaryQuery.isFetching || inventoryQuery.isFetching;

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

      <section className="panel data-panel">
        <div className="section-title">
          <h2>库存汇总</h2>
          <span>{customerSummaryQuery.isFetching ? '正在读取' : '按当前客户统计'}</span>
        </div>
        <div className="inbound-review-grid">
          <SummaryMetric label="库存总数" value={customerSummary?.totalQuantity ?? 0} />
          <SummaryMetric label="SKU 款数" value={customerSummary?.skuCount ?? 0} />
          <SummaryMetric label="在库" value={customerSummary?.inStockQuantity ?? 0} />
          <SummaryMetric
            label="可出库"
            value={customerSummary?.availableForOutboundQuantity ?? 0}
          />
          <SummaryMetric label="已装箱" value={customerSummary?.packedQuantity ?? 0} />
          <SummaryMetric label="已出库" value={customerSummary?.outboundQuantity ?? 0} />
          <SummaryMetric
            label="异常"
            value={customerSummary?.exceptionQuantity ?? 0}
            tone="warning"
          />
          <SummaryMetric label="作废" value={customerSummary?.voidedQuantity ?? 0} />
        </div>
      </section>

      <section className="panel data-panel">
        <div className="section-title">
          <h2>SKU 汇总明细</h2>
          <span>共 {productSummary?.total ?? 0} 款</span>
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
            </tr>
          </thead>
          <tbody>
            {productSummary?.items.map((row) => (
              <tr key={row.product.id}>
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
              </tr>
            ))}
            {!productSummary || productSummary.items.length === 0 ? (
              <tr>
                <td colSpan={11}>暂无 SKU 汇总</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="panel data-panel">
        <div className="section-title">
          <h2>IMEI 明细</h2>
          <span>共 {inventory?.total ?? 0} 条</span>
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
                <th>单号</th>
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
                  <td className="mono">{item.upsTrackingNo ?? '-'}</td>
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
                  <td colSpan={10}>暂无库存</td>
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
  product: { name: string; modelCode?: string | null };
  inboundItem?: { scannedAt?: string | null } | null;
  inboundBatch?: { batchNo: string } | null;
  latestOutboundBox?: { boxNo: string } | null;
};

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
