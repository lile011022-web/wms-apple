import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, PackagePlus, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listWarehouses } from '../../api/settings';
import { customersApi, outboundApi } from '../../api/workflow';
import { PaginationControls } from '../../components/pagination-controls';

export function OutboundPackingPage() {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [box, setBox] = useState<OutboundBox | null>(null);
  const [selectedHistoryBox, setSelectedHistoryBox] = useState<OutboundBox | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [availablePage, setAvailablePage] = useState(1);
  const [availablePageSize, setAvailablePageSize] = useState(50);
  const [boxesPage, setBoxesPage] = useState(1);
  const [boxesPageSize, setBoxesPageSize] = useState(20);
  const [boxItemsPage, setBoxItemsPage] = useState(1);
  const [boxItemsPageSize, setBoxItemsPageSize] = useState(20);
  const [selectedBoxItemsPage, setSelectedBoxItemsPage] = useState(1);
  const [selectedBoxItemsPageSize, setSelectedBoxItemsPageSize] = useState(20);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
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
    if (!customerId && customers[0]) setCustomerId(customers[0].id);
    if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id);
  }, [customerId, customers, warehouseId, warehouses]);

  const availableQuery = useQuery({
    queryKey: [
      'outbound-available-items',
      customerId,
      warehouseId,
      searchText,
      availablePage,
      availablePageSize,
    ],
    queryFn: () =>
      outboundApi.availableItems({
        customerId,
        warehouseId,
        page: availablePage,
        pageSize: availablePageSize,
        ...(searchText ? toAvailableSearchParams(searchText) : {}),
      }),
    enabled: Boolean(customerId),
  });
  const available = availableQuery.data as AvailableResult | undefined;
  const availableItems = available?.items ?? [];
  const availableIds = availableItems.map((item) => item.id);
  const selectedAvailableIds = selectedItemIds.filter((id) => availableIds.includes(id));
  const isAllAvailableSelected =
    availableIds.length > 0 && selectedAvailableIds.length === availableIds.length;
  const isBoxOpen = box?.status === 'OPEN';

  const boxesQuery = useQuery({
    queryKey: ['outbound-boxes', customerId, warehouseId, boxesPage, boxesPageSize],
    queryFn: () =>
      outboundApi.boxes({
        customerId,
        warehouseId,
        page: boxesPage,
        pageSize: boxesPageSize,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
    enabled: Boolean(customerId && warehouseId),
  });
  const boxes = boxesQuery.data as BoxListResult | undefined;

  useEffect(() => {
    setSelectedItemIds((current) => current.filter((id) => availableIds.includes(id)));
  }, [availableIds.join('|')]);

  useEffect(() => {
    setBoxItemsPage(1);
  }, [box?.id, box?.items.length]);

  useEffect(() => {
    setSelectedBoxItemsPage(1);
  }, [selectedHistoryBox?.id, selectedHistoryBox?.items.length]);

  const paginatedBoxItems = paginateItems(box?.items ?? [], boxItemsPage, boxItemsPageSize);
  const paginatedSelectedBoxItems = paginateItems(
    selectedHistoryBox?.items ?? [],
    selectedBoxItemsPage,
    selectedBoxItemsPageSize,
  );

  const createBoxMutation = useMutation({
    mutationFn: () =>
      outboundApi.createBox({
        customerId,
        warehouseId,
      }),
    onSuccess: (data) => {
      const nextBox = data as OutboundBox;
      setBox(nextBox);
      setSelectedHistoryBox(nextBox);
      setMessage('已创建出库箱');
      setErrorMessage('');
      boxesQuery.refetch();
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '创建箱号失败')),
  });
  const addItemMutation = useMutation({
    mutationFn: (inventoryItemId: string) => {
      if (!box) throw new Error('请先创建箱号');
      return outboundApi.addItem(box.id, { inventoryItemId });
    },
    onSuccess: (data, inventoryItemId) => {
      const updatedBox = data as OutboundBox;
      setBox(updatedBox);
      setSelectedHistoryBox(updatedBox);
      setMessage('已加入箱内');
      setErrorMessage('');
      setSelectedItemIds((current) => current.filter((id) => id !== inventoryItemId));
      availableQuery.refetch();
      boxesQuery.refetch();
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '装箱失败')),
  });
  const bulkAddMutation = useMutation({
    mutationFn: async (inventoryItemIds: string[]) => {
      if (!box) throw new Error('请先创建箱号');

      let updatedBox: unknown = box;
      for (const inventoryItemId of inventoryItemIds) {
        updatedBox = await outboundApi.addItem(box.id, { inventoryItemId });
      }

      return updatedBox;
    },
    onSuccess: (data) => {
      const updatedBox = data as OutboundBox;
      setBox(updatedBox);
      setSelectedHistoryBox(updatedBox);
      setSelectedItemIds([]);
      setMessage(`已批量加入 ${selectedAvailableIds.length} 件商品`);
      setErrorMessage('');
      availableQuery.refetch();
      boxesQuery.refetch();
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '批量装箱失败')),
  });
  const sealMutation = useMutation({
    mutationFn: () => {
      if (!box) throw new Error('请先创建箱号');
      return outboundApi.seal(box.id);
    },
    onSuccess: (data) => {
      const sealedBox = data as OutboundBox;
      setBox(sealedBox);
      setSelectedHistoryBox(sealedBox);
      setMessage('已封箱');
      setErrorMessage('');
      queryClient.invalidateQueries({ queryKey: ['inventory-customer-summary'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      boxesQuery.refetch();
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '封箱失败')),
  });

  const toggleSelectedItem = (itemId: string, checked: boolean) => {
    setSelectedItemIds((current) => {
      if (checked) {
        return current.includes(itemId) ? current : [...current, itemId];
      }

      return current.filter((id) => id !== itemId);
    });
  };

  const toggleAllAvailableItems = (checked: boolean) => {
    setSelectedItemIds((current) => {
      const currentOutsidePage = current.filter((id) => !availableIds.includes(id));
      return checked ? [...currentOutsidePage, ...availableIds] : currentOutsidePage;
    });
  };

  return (
    <section className="page-frame">
      <div className="page-heading">
        <p>Outbound</p>
        <h1>出库装箱</h1>
      </div>

      <section className="panel workflow-form">
        <label>
          <span>客户</span>
          <select
            value={customerId}
            onChange={(event) => {
              setCustomerId(event.target.value);
              setSelectedItemIds([]);
              setSelectedHistoryBox(null);
              setAvailablePage(1);
              setBoxesPage(1);
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
              setSelectedItemIds([]);
              setSelectedHistoryBox(null);
              setAvailablePage(1);
              setBoxesPage(1);
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
          type="button"
          disabled={isBoxOpen || createBoxMutation.isPending}
          onClick={() => createBoxMutation.mutate()}
        >
          <Box size={16} />
          {box?.status === 'SEALED' ? '创建新箱' : '创建箱号'}
        </button>
        <button
          type="button"
          disabled={!isBoxOpen || sealMutation.isPending}
          onClick={() => sealMutation.mutate()}
        >
          <ShieldCheck size={16} />
          封箱
        </button>
      </section>

      <section className="panel toolbar-panel">
        <label>
          <span>查找货物</span>
          <input
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value.trim());
              setAvailablePage(1);
            }}
            placeholder="UPS / IMEI / UPC"
          />
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => availableQuery.refetch()}
          disabled={!customerId || availableQuery.isFetching}
        >
          <Search size={16} />
          查询
        </button>
        <button
          type="button"
          disabled={!isBoxOpen || selectedAvailableIds.length === 0 || bulkAddMutation.isPending}
          onClick={() => bulkAddMutation.mutate(selectedAvailableIds)}
        >
          <PackagePlus size={16} />
          {bulkAddMutation.isPending ? '批量装箱中' : `批量装箱 ${selectedAvailableIds.length} 件`}
        </button>
      </section>

      {message ? <div className="inline-success">{message}</div> : null}
      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}

      <section className="panel data-panel">
        <div className="section-title">
          <h2>当前操作箱</h2>
          <span>{box ? `${box.boxNo} / ${box.status}` : '尚未建箱'}</span>
        </div>
        <div className="summary-strip">
          <span>箱号 {box?.boxNo ?? '-'}</span>
          <span>状态 {box?.status ?? '-'}</span>
          <span>箱内 {box?.itemCount ?? 0} 件</span>
          <span>创建时间 {formatDateTime(box?.createdAt)}</span>
          <span>封箱时间 {formatDateTime(box?.sealedAt)}</span>
        </div>
      </section>

      <section className="panel data-panel">
        <div className="section-title">
          <h2>可出库库存</h2>
          <span>
            {box ? `${box.boxNo} / ${box.status}` : '尚未建箱'} · 可选 {available?.total ?? 0} 件
          </span>
        </div>
        <PaginationControls
          page={availablePage}
          pageSize={availablePageSize}
          total={available?.total ?? 0}
          isFetching={availableQuery.isFetching}
          onPageChange={setAvailablePage}
          onPageSizeChange={(nextPageSize) => {
            setAvailablePageSize(nextPageSize);
            setAvailablePage(1);
          }}
        />
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <input
                  aria-label="选择当前页可出库库存"
                  type="checkbox"
                  checked={isAllAvailableSelected}
                  disabled={availableIds.length === 0}
                  onChange={(event) => toggleAllAvailableItems(event.target.checked)}
                />
              </th>
              <th>物流单号</th>
              <th>IMEI</th>
              <th>UPC</th>
              <th>商品</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {availableItems.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    aria-label={`选择 ${item.imei ?? item.serial ?? item.id}`}
                    type="checkbox"
                    checked={selectedItemIds.includes(item.id)}
                    onChange={(event) => toggleSelectedItem(item.id, event.target.checked)}
                  />
                </td>
                <td className="mono">{item.upsTrackingNo ?? '-'}</td>
                <td>{item.imei ?? item.serial}</td>
                <td>{item.upc}</td>
                <td>{item.product.name}</td>
                <td>{item.status}</td>
                <td>
                  <button
                    type="button"
                    className="table-action"
                    disabled={!isBoxOpen}
                    onClick={() => addItemMutation.mutate(item.id)}
                  >
                    <PackagePlus size={15} />
                    装箱
                  </button>
                </td>
              </tr>
            ))}
            {!available || available.items.length === 0 ? (
              <tr>
                <td colSpan={7}>没有可出库库存</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="panel data-panel">
        <div className="section-title">
          <h2>箱内明细</h2>
          <span>{box?.itemCount ?? 0} 件</span>
        </div>
        <PaginationControls
          page={boxItemsPage}
          pageSize={boxItemsPageSize}
          total={box?.items.length ?? 0}
          onPageChange={setBoxItemsPage}
          onPageSizeChange={(nextPageSize) => {
            setBoxItemsPageSize(nextPageSize);
            setBoxItemsPage(1);
          }}
          pageSizeOptions={[10, 20, 50, 100]}
        />
        <table className="data-table">
          <thead>
            <tr>
              <th>物流单号</th>
              <th>IMEI</th>
              <th>商品</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {paginatedBoxItems.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.inventoryItem.upsTrackingNo ?? '-'}</td>
                <td>{item.inventoryItem.imei ?? item.inventoryItem.serial}</td>
                <td>{item.inventoryItem.product.name}</td>
                <td>{item.inventoryItem.status}</td>
              </tr>
            ))}
            {!box || box.items.length === 0 ? (
              <tr>
                <td colSpan={4}>箱内暂无商品</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="panel data-panel">
        <div className="section-title">
          <h2>最近箱子</h2>
          <span>{boxes?.total ?? 0} 个箱子</span>
        </div>
        <PaginationControls
          page={boxesPage}
          pageSize={boxesPageSize}
          total={boxes?.total ?? 0}
          isFetching={boxesQuery.isFetching}
          onPageChange={setBoxesPage}
          onPageSizeChange={(nextPageSize) => {
            setBoxesPageSize(nextPageSize);
            setBoxesPage(1);
          }}
        />
        <table className="data-table">
          <thead>
            <tr>
              <th>箱号</th>
              <th>状态</th>
              <th>件数</th>
              <th>创建时间</th>
              <th>封箱时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {boxes?.items.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.boxNo}</td>
                <td>{item.status}</td>
                <td>{item.itemCount}</td>
                <td>{formatDateTime(item.createdAt)}</td>
                <td>{formatDateTime(item.sealedAt)}</td>
                <td>
                  <button
                    type="button"
                    className="table-action"
                    onClick={() => setSelectedHistoryBox(item)}
                  >
                    查看
                  </button>
                </td>
              </tr>
            ))}
            {!boxes || boxes.items.length === 0 ? (
              <tr>
                <td colSpan={6}>暂无出库箱记录</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="panel data-panel">
        <div className="section-title">
          <h2>所选箱子明细</h2>
          <span>
            {selectedHistoryBox
              ? `${selectedHistoryBox.boxNo} / ${selectedHistoryBox.status}`
              : '未选择箱子'}
          </span>
        </div>
        <div className="summary-strip">
          <span>箱号 {selectedHistoryBox?.boxNo ?? '-'}</span>
          <span>状态 {selectedHistoryBox?.status ?? '-'}</span>
          <span>件数 {selectedHistoryBox?.itemCount ?? 0}</span>
          <span>创建时间 {formatDateTime(selectedHistoryBox?.createdAt)}</span>
          <span>封箱时间 {formatDateTime(selectedHistoryBox?.sealedAt)}</span>
        </div>
        <PaginationControls
          page={selectedBoxItemsPage}
          pageSize={selectedBoxItemsPageSize}
          total={selectedHistoryBox?.items.length ?? 0}
          onPageChange={setSelectedBoxItemsPage}
          onPageSizeChange={(nextPageSize) => {
            setSelectedBoxItemsPageSize(nextPageSize);
            setSelectedBoxItemsPage(1);
          }}
          pageSizeOptions={[10, 20, 50, 100]}
        />
        <table className="data-table">
          <thead>
            <tr>
              <th>物流单号</th>
              <th>IMEI</th>
              <th>UPC</th>
              <th>商品</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {paginatedSelectedBoxItems.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.inventoryItem.upsTrackingNo ?? '-'}</td>
                <td>{item.inventoryItem.imei ?? item.inventoryItem.serial}</td>
                <td>{item.inventoryItem.upc}</td>
                <td>{item.inventoryItem.product.name}</td>
                <td>{item.inventoryItem.status}</td>
              </tr>
            ))}
            {!selectedHistoryBox || selectedHistoryBox.items.length === 0 ? (
              <tr>
                <td colSpan={5}>请选择箱子查看明细</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </section>
  );
}

type CustomerOption = { id: string; label: string };
type AvailableResult = { items: AvailableItem[]; total: number; page: number; pageSize: number };
type BoxListResult = { items: OutboundBox[]; total: number; page: number; pageSize: number };
type AvailableItem = {
  id: string;
  upc: string;
  upsTrackingNo: string | null;
  imei: string | null;
  serial: string | null;
  status: string;
  product: { name: string };
};
type OutboundBox = {
  id: string;
  boxNo: string;
  status: string;
  itemCount: number;
  createdAt?: string;
  sealedAt?: string | null;
  items: Array<{
    id: string;
    inventoryItem: {
      id: string;
      upsTrackingNo: string | null;
      upc: string;
      imei: string | null;
      serial: string | null;
      status: string;
      product: { name: string };
    };
  }>;
};

function toAvailableSearchParams(searchText: string) {
  if (/^1Z/i.test(searchText)) {
    return { upsTrackingNo: searchText };
  }
  if (/^\d{15}$/.test(searchText)) {
    return { imei: searchText };
  }
  if (/^\d{8,14}$/.test(searchText)) {
    return { upc: searchText };
  }

  return { upsTrackingNo: searchText };
}

function toUserErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString();
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
