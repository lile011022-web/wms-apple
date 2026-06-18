import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { customersApi, inventoryApi } from '../../api/workflow';

export function CustomerInventoryPage() {
  const [customerId, setCustomerId] = useState('');
  const customersQuery = useQuery({
    queryKey: ['customer-options'],
    queryFn: () => customersApi.options(),
  });
  const customers = (customersQuery.data as CustomerOption[] | undefined) ?? [];

  useEffect(() => {
    if (!customerId && customers[0]) {
      setCustomerId(customers[0].id);
    }
  }, [customerId, customers]);

  const inventoryQuery = useQuery({
    queryKey: ['inventory-items', customerId],
    queryFn: () => inventoryApi.items({ customerId }),
    enabled: Boolean(customerId),
  });
  const inventory = inventoryQuery.data as InventoryResult | undefined;

  return (
    <section className="page-frame">
      <div className="page-heading">
        <p>Inventory</p>
        <h1>客户库存</h1>
      </div>

      <section className="panel toolbar-panel">
        <label>
          <span>客户</span>
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => inventoryQuery.refetch()}>
          <RefreshCw size={16} />
          刷新库存
        </button>
      </section>

      <section className="panel data-panel">
        <div className="section-title">
          <h2>IMEI 明细</h2>
          <span>共 {inventory?.total ?? 0} 条</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>IMEI</th>
              <th>UPC</th>
              <th>商品</th>
              <th>状态</th>
              <th>可出库</th>
              <th>箱号</th>
            </tr>
          </thead>
          <tbody>
            {inventory?.items.map((item) => (
              <tr key={item.id}>
                <td>{item.imei ?? item.serial}</td>
                <td>{item.upc}</td>
                <td>{item.product.name}</td>
                <td>{item.status}</td>
                <td>{item.availableForOutbound ? '是' : '否'}</td>
                <td>{item.latestOutboundBox?.boxNo ?? '-'}</td>
              </tr>
            ))}
            {!inventory || inventory.items.length === 0 ? (
              <tr>
                <td colSpan={6}>暂无库存</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </section>
  );
}

type CustomerOption = { id: string; label: string };
type InventoryResult = {
  items: InventoryItem[];
  total: number;
};
type InventoryItem = {
  id: string;
  upc: string;
  imei: string | null;
  serial: string | null;
  status: string;
  availableForOutbound: boolean;
  product: { name: string };
  latestOutboundBox?: { boxNo: string } | null;
};
