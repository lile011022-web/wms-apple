import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageCheck, Plus, ScanLine } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { listWarehouses } from '../../api/settings';
import { customersApi, inboundApi } from '../../api/workflow';

const inboundLockStorageKey = 'wms_scan_inbound_lock';

let inboundScanInputCache = {
  upsTrackingNo: '',
  upc: '',
  imei: '',
};

export function InboundScanPage() {
  const queryClient = useQueryClient();
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
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (error) => {
      setErrorMessage(toUserErrorMessage(error, '确认入库失败'));
    },
  });

  const handleCreateDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createDraftMutation.mutate();
  };

  return (
    <section className="page-frame">
      <div className="page-heading">
        <p>Inbound</p>
        <h1>扫码入库</h1>
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
          disabled={
            !isCurrentSelectionLocked || !upc.trim() || !imei.trim() || addItemMutation.isPending
          }
          onClick={() => addItemMutation.mutate()}
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

      {message ? <div className="inline-success">{message}</div> : null}
      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}
      <DraftPanel draft={draft} />
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
    status: string;
    product?: { name: string } | null;
  }>;
};

function DraftPanel({ draft }: { draft: InboundDraft | null }) {
  return (
    <section className="panel data-panel">
      <div className="section-title">
        <h2>当前入库单</h2>
        <span>{draft ? `${draft.batchNo} / ${draft.status}` : '尚未创建'}</span>
      </div>
      <div className="summary-strip">
        <span>总数 {draft?.summary.totalItems ?? 0}</span>
        <span>待确认 {draft?.summary.pendingItems ?? 0}</span>
        <span>已确认 {draft?.summary.confirmedItems ?? 0}</span>
        <span>异常 {draft?.summary.exceptionItems ?? 0}</span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>物流单号</th>
            <th>UPC</th>
            <th>IMEI</th>
            <th>商品</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {draft?.items.map((item) => (
            <tr key={item.id}>
              <td className="mono">{item.upsTrackingNo ?? '-'}</td>
              <td>{item.upc}</td>
              <td>{item.imei}</td>
              <td>{item.product?.name ?? '-'}</td>
              <td>{item.status}</td>
            </tr>
          ))}
          {!draft || draft.items.length === 0 ? (
            <tr>
              <td colSpan={5}>暂无明细</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
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
