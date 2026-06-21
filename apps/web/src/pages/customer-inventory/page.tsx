import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listWarehouses } from '../../api/settings';
import { customersApi, inventoryApi } from '../../api/workflow';
import { PaginationControls } from '../../components/pagination-controls';

export function CustomerInventoryPage() {
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [summaryPage, setSummaryPage] = useState(1);
  const [summaryPageSize, setSummaryPageSize] = useState(20);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(50);
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
    queryKey: ['inventory-items', customerId, warehouseId, detailPage, detailPageSize],
    queryFn: () =>
      inventoryApi.items({ customerId, warehouseId, page: detailPage, pageSize: detailPageSize }),
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
                <td colSpan={10}>暂无 SKU 汇总</td>
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
        />
        <table className="data-table">
          <thead>
            <tr>
              <th>单号</th>
              <th>入库单号</th>
              <th>出单号/箱号</th>
              <th>IMEI</th>
              <th>UPC</th>
              <th>商品</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {inventory?.items.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.upsTrackingNo ?? '-'}</td>
                <td className="mono">{item.inboundBatch?.batchNo ?? '-'}</td>
                <td className="mono">{item.latestOutboundBox?.boxNo ?? '-'}</td>
                <td>{item.imei ?? item.serial}</td>
                <td>{item.upc}</td>
                <td>{item.product.name}</td>
                <td>{item.status}</td>
              </tr>
            ))}
            {!inventory || inventory.items.length === 0 ? (
              <tr>
                <td colSpan={7}>暂无库存</td>
              </tr>
            ) : null}
          </tbody>
        </table>
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
  product: { name: string };
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
