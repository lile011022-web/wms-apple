import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowDownUp,
  Box,
  CheckCircle2,
  Eye,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { listWarehouses } from '../../api/settings';
import { customersApi, outboundApi } from '../../api/workflow';

type Carrier = 'UPS' | 'FedEx' | 'USPS';
type BoxStatus = 'draft' | 'sealed' | 'rework';
type ItemStatus = 'available' | 'packed' | 'exception';
type WeightUnit = 'lb';

type BoxSizePreset = {
  label: string;
  length: number;
  width: number;
  height: number;
  unit: 'in';
};

type PackingItem = {
  id: string;
  boxItemId?: string;
  carrier: Carrier;
  trackingNumber: string;
  upc?: string;
  productName?: string;
  imeiOrSerial?: string;
  customerId: string;
  customerName: string;
  status: ItemStatus;
  addedAt?: string;
  raw?: AvailableItem | OutboundBox['items'][number];
};

type PackingBox = {
  id: string;
  boxNo: string;
  name: string;
  status: BoxStatus;
  sizeLabel: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  weightUnit: WeightUnit;
  note?: string;
  itemCount: number;
  items: PackingItem[];
  createdAt: string;
  updatedAt: string;
  sealedAt?: string | null;
  raw: OutboundBox;
};

const defaultSizePreset: BoxSizePreset = {
  label: '12 × 12 × 12 in',
  length: 12,
  width: 12,
  height: 12,
  unit: 'in',
};

const boxSizePresets: BoxSizePreset[] = [
  defaultSizePreset,
  { label: '10 × 10 × 10 in', length: 10, width: 10, height: 10, unit: 'in' },
  { label: '14 × 14 × 14 in', length: 14, width: 14, height: 14, unit: 'in' },
  { label: '16 × 16 × 16 in', length: 16, width: 16, height: 16, unit: 'in' },
  { label: '18 × 18 × 18 in', length: 18, width: 18, height: 18, unit: 'in' },
  { label: '20 × 20 × 20 in', length: 20, width: 20, height: 20, unit: 'in' },
  { label: '24 × 18 × 18 in', length: 24, width: 18, height: 18, unit: 'in' },
];

const customSizePreset = 'Custom';
const defaultBoxWeight = 45;
const defaultBoxNo = 'Box 0042';

export function OutboundPackingPage() {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [currentBox, setCurrentBox] = useState<PackingBox | null>(null);
  const [detailBox, setDetailBox] = useState<PackingBox | null>(null);
  const [trackingSearch, setTrackingSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [boxSearch, setBoxSearch] = useState('');
  const [boxNoDraft, setBoxNoDraft] = useState(defaultBoxNo);
  const [boxName, setBoxName] = useState('');
  const [sizeLabel, setSizeLabel] = useState(defaultSizePreset.label);
  const [manualSizeOpen, setManualSizeOpen] = useState(false);
  const [manualSize, setManualSize] = useState({
    length: defaultSizePreset.length,
    width: defaultSizePreset.width,
    height: defaultSizePreset.height,
  });
  const [weight, setWeight] = useState(String(defaultBoxWeight));
  const [note, setNote] = useState('');
  const [availablePage, setAvailablePage] = useState(1);
  const [availablePageSize, setAvailablePageSize] = useState(10);
  const [selectedAvailableItemIds, setSelectedAvailableItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [boxItemsPage, setBoxItemsPage] = useState(1);
  const [boxItemsPageSize, setBoxItemsPageSize] = useState(10);
  const [selectedBoxItemIds, setSelectedBoxItemIds] = useState<Set<string>>(() => new Set());
  const [selectedCreatedBoxIds, setSelectedCreatedBoxIds] = useState<Set<string>>(() => new Set());
  const [deleteBoxesConfirmOpen, setDeleteBoxesConfirmOpen] = useState(false);
  const [boxesPage, setBoxesPage] = useState(1);
  const [boxesPageSize] = useState(8);
  const [reworkBoxIds, setReworkBoxIds] = useState<Set<string>>(() => new Set());
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [removedItemIds, setRemovedItemIds] = useState<Set<string>>(() => new Set());
  const [locallyPackedInventoryIds, setLocallyPackedInventoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bouncingBoxId, setBouncingBoxId] = useState<string | null>(null);
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

  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const activeInventorySearch = inventorySearch.trim() || trackingSearch.trim();
  const availableQueryKey = [
    'outbound-available-items',
    customerId,
    warehouseId,
    activeInventorySearch,
    availablePage,
    availablePageSize,
  ] as const;
  const boxesQueryKey = ['outbound-boxes', customerId, warehouseId, boxesPage, boxesPageSize] as const;
  const availableQuery = useQuery({
    queryKey: availableQueryKey,
    queryFn: () =>
      outboundApi.availableItems({
        customerId,
        warehouseId,
        page: availablePage,
        pageSize: availablePageSize,
        ...(activeInventorySearch ? { search: activeInventorySearch } : {}),
      }),
    enabled: Boolean(customerId),
  });
  const available = availableQuery.data as AvailableResult | undefined;
  const availableItems = useMemo(
    () =>
      (available?.items ?? [])
        .filter((item) => !locallyPackedInventoryIds.has(item.id))
        .map((item) => toPackingItem(item, selectedCustomer)),
    [available?.items, locallyPackedInventoryIds, selectedCustomer],
  );
  const locallyHiddenAvailableCount = (available?.items ?? []).filter((item) =>
    locallyPackedInventoryIds.has(item.id),
  ).length;
  const availableTotal = Math.max(0, (available?.total ?? 0) - locallyHiddenAvailableCount);

  const boxesQuery = useQuery({
    queryKey: boxesQueryKey,
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
  const createdBoxes = useMemo(
    () => (boxes?.items ?? []).map((box) => toPackingBox(box, reworkBoxIds)),
    [boxes?.items, reworkBoxIds],
  );
  const boxNameExists = (name: string, excludeBoxId?: string) => {
    const normalizedName = name.trim().toLowerCase();
    if (!normalizedName) {
      return false;
    }
    return createdBoxes.some(
      (box) => box.id !== excludeBoxId && box.name.trim().toLowerCase() === normalizedName,
    );
  };

  const filteredCurrentBoxItems = useMemo(() => {
    const items = currentBox?.items ?? [];
    const query = boxSearch.trim().toLowerCase();
    if (!query) {
      return items;
    }
    return items.filter((item) =>
      [item.trackingNumber, item.imeiOrSerial, item.upc, item.productName, item.carrier].some(
        (value) => value?.toLowerCase().includes(query),
      ),
    );
  }, [boxSearch, currentBox?.items]);
  const visibleCurrentBoxItems = paginateItems(
    filteredCurrentBoxItems,
    boxItemsPage,
    boxItemsPageSize,
  );
  const canMutateCurrentBox = currentBox?.status === 'draft' || currentBox?.status === 'rework';
  const updateBoxEverywhere = (box: OutboundBox) => {
    const nextBox = toPackingBox(box, reworkBoxIds);
    setCurrentBox((current) => (current?.id === nextBox.id ? nextBox : current));
    setDetailBox((current) => (current?.id === nextBox.id ? nextBox : current));
    queryClient.setQueryData<BoxListResult | undefined>(boxesQueryKey, (current) =>
      upsertBoxListResult(current, box),
    );
    return nextBox;
  };
  const loadFullBox = async (box: PackingBox) => {
    if (box.items.length === box.itemCount) {
      return box;
    }
    const data = (await outboundApi.getBox(box.id)) as OutboundBox;
    return updateBoxEverywhere(data);
  };

  useEffect(() => {
    setAvailablePage(1);
    setLocallyPackedInventoryIds(new Set());
    setSelectedAvailableItemIds(new Set());
  }, [activeInventorySearch, customerId]);

  useEffect(() => {
    setSelectedAvailableItemIds(new Set());
  }, [availablePage, availablePageSize, customerId, warehouseId]);

  useEffect(() => {
    setBoxItemsPage(1);
    setSelectedBoxItemIds(new Set());
  }, [boxSearch, currentBox?.id, currentBox?.items.length]);

  useEffect(() => {
    if (!currentBox) return;
    setBoxNoDraft(currentBox.boxNo);
    setBoxName(currentBox.name);
    setSizeLabel(currentBox.sizeLabel);
    setManualSize({
      length: currentBox.length,
      width: currentBox.width,
      height: currentBox.height,
    });
    setManualSizeOpen(currentBox.sizeLabel === customSizePreset);
    setWeight(String(currentBox.weight || defaultBoxWeight));
    setNote(currentBox.note ?? '');
  }, [currentBox?.id]);

  useEffect(() => {
    if (highlightedItemId) {
      const timer = window.setTimeout(() => setHighlightedItemId(null), 1000);
      return () => window.clearTimeout(timer);
    }
  }, [highlightedItemId]);

  const createBoxMutation = useMutation({
    mutationFn: () => {
      if (boxNameExists(boxName)) {
        throw new Error('箱子名称已存在，请换一个名称。');
      }
      return outboundApi.createBox({
        customerId,
        warehouseId,
        boxName: boxName.trim() || undefined,
        ...toBackendBoxSize(sizeLabel, manualSize),
        weightLb: toWeightNumber(weight),
        notes: note.trim() || undefined,
      });
    },
    onSuccess: (data) => {
      const nextBox = toPackingBox(data as OutboundBox, reworkBoxIds);
      setCurrentBox(nextBox);
      setDetailBox(nextBox);
      setMessage('已新建箱子');
      setErrorMessage('');
      queryClient.setQueryData<BoxListResult | undefined>(boxesQueryKey, (current) =>
        upsertBoxListResult(current, data as OutboundBox),
      );
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '新建箱子失败')),
  });

  const updateBoxMutation = useMutation({
    mutationFn: () => {
      if (!currentBox) throw new Error('请先选择或新建箱子');
      if (boxNameExists(boxName, currentBox.id)) {
        throw new Error('箱子名称已存在，请换一个名称。');
      }
      return outboundApi.updateBox(currentBox.id, {
        boxName: boxName.trim() || undefined,
        ...toBackendBoxSize(sizeLabel, manualSize),
        weightLb: toWeightNumber(weight),
        notes: note.trim() || undefined,
      });
    },
    onSuccess: (data) => {
      updateBoxEverywhere(data as OutboundBox);
      setMessage('已暂存箱子设置');
      setErrorMessage('');
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '暂存失败')),
  });

  const addItemMutation = useMutation({
    mutationFn: (inventoryItemId: string) => {
      if (!currentBox) throw new Error('请先选择或新建箱子');
      return outboundApi.addItem(currentBox.id, { inventoryItemId });
    },
    onMutate: async (inventoryItemId) => {
      const previousBox = currentBox;
      const previousPackedIds = new Set(locallyPackedInventoryIds);
      const item = availableItems.find((availableItem) => availableItem.id === inventoryItemId);
      if (!previousBox || !item || previousBox.items.some((boxItem) => boxItem.id === item.id)) {
        return { previousBox, previousPackedIds };
      }
      const optimisticItem = {
        ...item,
        status: 'packed' as const,
        addedAt: new Date().toISOString(),
      };
      setLocallyPackedInventoryIds((current) => new Set(current).add(inventoryItemId));
      setCurrentBox({
        ...previousBox,
        itemCount: previousBox.itemCount + 1,
        items: [...previousBox.items, optimisticItem],
        updatedAt: new Date().toISOString(),
      });
      setHighlightedItemId(optimisticItem.id);
      setMessage('正在加入当前箱子');
      setErrorMessage('');
      return { previousBox, previousPackedIds };
    },
    onSuccess: (data, inventoryItemId) => {
      const updatedBox = updateBoxEverywhere(data as OutboundBox);
      const latestItem = updatedBox.items.find((item) => item.id === inventoryItemId);
      setLocallyPackedInventoryIds((current) => new Set(current).add(inventoryItemId));
      setHighlightedItemId(latestItem?.id ?? null);
      setMessage('已加入当前箱子');
      setErrorMessage('');
    },
    onError: (error, _inventoryItemId, context) => {
      if (context?.previousBox) {
        setCurrentBox(context.previousBox);
      }
      if (context?.previousPackedIds) {
        setLocallyPackedInventoryIds(context.previousPackedIds);
      }
      setErrorMessage(toUserErrorMessage(error, '加入箱子失败'));
    },
  });

  const batchAddItemsMutation = useMutation({
    mutationFn: async (inventoryItemIds: string[]) => {
      if (!currentBox) throw new Error('请先选择或新建箱子');
      if (inventoryItemIds.length === 0) throw new Error('请先选择可装箱货物');

      let latestBox: OutboundBox | null = null;
      for (const inventoryItemId of inventoryItemIds) {
        latestBox = (await outboundApi.addItem(currentBox.id, { inventoryItemId })) as OutboundBox;
      }
      return latestBox;
    },
    onMutate: async (inventoryItemIds) => {
      const previousBox = currentBox;
      const previousPackedIds = new Set(locallyPackedInventoryIds);
      const ids = new Set(inventoryItemIds);
      const optimisticItems = availableItems
        .filter((item) => ids.has(item.id))
        .map((item) => ({
          ...item,
          status: 'packed' as const,
          addedAt: new Date().toISOString(),
        }));
      setLocallyPackedInventoryIds((current) => {
        const next = new Set(current);
        for (const inventoryItemId of inventoryItemIds) {
          next.add(inventoryItemId);
        }
        return next;
      });
      if (previousBox && optimisticItems.length > 0) {
        const existingIds = new Set(previousBox.items.map((item) => item.id));
        const newItems = optimisticItems.filter((item) => !existingIds.has(item.id));
        setCurrentBox({
          ...previousBox,
          itemCount: previousBox.itemCount + newItems.length,
          items: [...previousBox.items, ...newItems],
          updatedAt: new Date().toISOString(),
        });
      }
      setMessage(`正在批量加入 ${inventoryItemIds.length} 件货物`);
      setErrorMessage('');
      return { previousBox, previousPackedIds };
    },
    onSuccess: (data, inventoryItemIds) => {
      if (data) {
        updateBoxEverywhere(data);
      }
      setSelectedAvailableItemIds(new Set());
      setMessage(`已批量加入 ${inventoryItemIds.length} 件货物`);
      setErrorMessage('');
    },
    onError: (error, _inventoryItemIds, context) => {
      if (context?.previousBox) {
        setCurrentBox(context.previousBox);
      }
      if (context?.previousPackedIds) {
        setLocallyPackedInventoryIds(context.previousPackedIds);
      }
      setErrorMessage(toUserErrorMessage(error, '批量加入箱子失败'));
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: (item: PackingItem) => {
      if (!currentBox) throw new Error('请先选择或新建箱子');
      setRemovedItemIds((current) => new Set(current).add(item.id));
      return outboundApi.removeItem(currentBox.id, item.boxItemId ?? item.id);
    },
    onMutate: async (item) => {
      const previousBox = currentBox;
      const previousPackedIds = new Set(locallyPackedInventoryIds);
      setRemovedItemIds((current) => new Set(current).add(item.id));
      if (previousBox) {
        setCurrentBox({
          ...previousBox,
          itemCount: Math.max(0, previousBox.itemCount - 1),
          items: previousBox.items.filter((boxItem) => boxItem.id !== item.id),
          updatedAt: new Date().toISOString(),
        });
      }
      setLocallyPackedInventoryIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setMessage('正在删除箱内货物');
      setErrorMessage('');
      return { previousBox, previousPackedIds };
    },
    onSuccess: (data) => {
      const result = data as { box: OutboundBox };
      updateBoxEverywhere(result.box);
      setMessage('已删除箱内货物');
      setErrorMessage('');
      setRemovedItemIds(new Set());
    },
    onError: (error, _item, context) => {
      if (context?.previousBox) {
        setCurrentBox(context.previousBox);
      }
      if (context?.previousPackedIds) {
        setLocallyPackedInventoryIds(context.previousPackedIds);
      }
      setRemovedItemIds(new Set());
      setErrorMessage(toUserErrorMessage(error, '删除货物失败'));
    },
  });

  const bulkRemoveMutation = useMutation({
    mutationFn: async (items: PackingItem[]) => {
      if (!currentBox) throw new Error('请先选择或新建箱子');
      if (items.length === 0) throw new Error('请先选择要删除的货物');
      setRemovedItemIds(new Set(items.map((item) => item.id)));

      let latestBox: OutboundBox | null = null;
      for (const item of items) {
        const result = (await outboundApi.removeItem(currentBox.id, item.boxItemId ?? item.id)) as {
          box: OutboundBox;
        };
        latestBox = result.box;
      }
      return latestBox;
    },
    onMutate: async (items) => {
      const previousBox = currentBox;
      const previousPackedIds = new Set(locallyPackedInventoryIds);
      const ids = new Set(items.map((item) => item.id));
      setRemovedItemIds(ids);
      if (previousBox) {
        setCurrentBox({
          ...previousBox,
          itemCount: Math.max(0, previousBox.itemCount - ids.size),
          items: previousBox.items.filter((item) => !ids.has(item.id)),
          updatedAt: new Date().toISOString(),
        });
      }
      setLocallyPackedInventoryIds((current) => {
        const next = new Set(current);
        for (const id of ids) {
          next.delete(id);
        }
        return next;
      });
      setMessage(`正在批量删除 ${items.length} 件货物`);
      setErrorMessage('');
      return { previousBox, previousPackedIds };
    },
    onSuccess: (data, items) => {
      if (data) {
        updateBoxEverywhere(data);
      }
      setSelectedBoxItemIds(new Set());
      setRemovedItemIds(new Set());
      setMessage(`已批量删除 ${items.length} 件货物`);
      setErrorMessage('');
    },
    onError: (error, _items, context) => {
      if (context?.previousBox) {
        setCurrentBox(context.previousBox);
      }
      if (context?.previousPackedIds) {
        setLocallyPackedInventoryIds(context.previousPackedIds);
      }
      setRemovedItemIds(new Set());
      setErrorMessage(toUserErrorMessage(error, '批量删除失败'));
    },
  });

  const selectedCreatedBoxes = createdBoxes.filter((box) => selectedCreatedBoxIds.has(box.id));
  const deleteBoxesMutation = useMutation({
    mutationFn: async (boxesToDelete: PackingBox[]) => {
      if (boxesToDelete.length === 0) {
        throw new Error('请先选择要删除的箱子');
      }
      for (const box of boxesToDelete) {
        await outboundApi.deleteBox(box.id);
      }
      return boxesToDelete;
    },
    onSuccess: (deletedBoxes) => {
      const deletedIds = new Set(deletedBoxes.map((box) => box.id));
      setSelectedCreatedBoxIds(new Set());
      setDeleteBoxesConfirmOpen(false);
      if (currentBox && deletedIds.has(currentBox.id)) {
        setCurrentBox(null);
      }
      if (detailBox && deletedIds.has(detailBox.id)) {
        setDetailBox(null);
      }
      setMessage(`已删除 ${deletedBoxes.length} 个箱子`);
      setErrorMessage('');
      queryClient.setQueryData<BoxListResult | undefined>(boxesQueryKey, (current) =>
        removeBoxesFromListResult(current, deletedIds),
      );
      queryClient.invalidateQueries({ queryKey: ['outbound-available-items'], refetchType: 'none' });
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '删除箱子失败')),
  });

  const sealMutation = useMutation({
    mutationFn: (boxId?: string) => {
      const targetBoxId = boxId ?? currentBox?.id;
      if (!targetBoxId) throw new Error('请先选择或新建箱子');
      return outboundApi.seal(targetBoxId);
    },
    onMutate: async (boxId) => {
      const targetBoxId = boxId ?? currentBox?.id;
      const previousBox = currentBox;
      const previousDetailBox = detailBox;
      const previousBoxes = queryClient.getQueryData<BoxListResult>(boxesQueryKey);
      const sealedAt = new Date().toISOString();
      const sealBox = (box: PackingBox) =>
        box.id === targetBoxId ? { ...box, status: 'sealed' as const, sealedAt } : box;
      const boxToSeal = currentBox;
      if (boxToSeal && boxToSeal.id === targetBoxId) {
        setCurrentBox(sealBox(boxToSeal));
      }
      const detailBoxToSeal = detailBox;
      if (detailBoxToSeal && detailBoxToSeal.id === targetBoxId) {
        setDetailBox(sealBox(detailBoxToSeal));
      }
      setMessage('正在确认封箱');
      setErrorMessage('');
      return { previousBox, previousDetailBox, previousBoxes };
    },
    onSuccess: (data) => {
      const sealedBox = updateBoxEverywhere(data as OutboundBox);
      setReworkBoxIds((current) => {
        const next = new Set(current);
        next.delete(sealedBox.id);
        return next;
      });
      setCurrentBox({ ...sealedBox, status: 'sealed' });
      setMessage('已确认封箱');
      setErrorMessage('');
      queryClient.invalidateQueries({ queryKey: ['inventory-customer-summary'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['inventory-products'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'], refetchType: 'none' });
    },
    onError: (error, _boxId, context) => {
      setCurrentBox(context?.previousBox ?? null);
      setDetailBox(context?.previousDetailBox ?? null);
      if (context?.previousBoxes) {
        queryClient.setQueryData(boxesQueryKey, context.previousBoxes);
      }
      setErrorMessage(toUserErrorMessage(error, '确认封箱失败'));
    },
  });

  const reopenMutation = useMutation({
    mutationFn: (boxId: string) => outboundApi.reopen(boxId),
    onSuccess: (data) => {
      const reopenedRawBox = data as OutboundBox;
      setReworkBoxIds((current) => new Set(current).add(reopenedRawBox.id));
      const reopenedBox = toPackingBox(reopenedRawBox, new Set([reopenedRawBox.id]));
      setCurrentBox(reopenedBox);
      setDetailBox(reopenedBox);
      setMessage('已进入返工中，可继续添加或删除货物');
      setErrorMessage('');
      queryClient.setQueryData<BoxListResult | undefined>(boxesQueryKey, (current) =>
        upsertBoxListResult(current, reopenedRawBox),
      );
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '返工失败')),
  });

  const openBoxDetail = (box: PackingBox) => {
    setBouncingBoxId(box.id);
    window.setTimeout(() => {
      void loadFullBox(box)
        .then(setDetailBox)
        .catch((error) => setErrorMessage(toUserErrorMessage(error, '读取箱子明细失败')))
        .finally(() => setBouncingBoxId(null));
    }, 160);
  };

  return (
    <section className="outbound-workbench page-frame">
      <TrackingSearchBar
        customers={customers}
        customerId={customerId}
        trackingSearch={trackingSearch}
        isSearching={availableQuery.isFetching}
        onCustomerChange={(nextCustomerId) => {
          setCustomerId(nextCustomerId);
          setCurrentBox(null);
          setDetailBox(null);
          setAvailablePage(1);
          setBoxesPage(1);
        }}
        onSearchChange={setTrackingSearch}
        onSearch={() => availableQuery.refetch()}
      />

      <BoxQuickEditor
        boxNo={boxNoDraft}
        boxName={boxName}
        sizeLabel={sizeLabel}
        manualSize={manualSize}
        manualSizeOpen={manualSizeOpen}
        weight={weight}
        note={note}
        currentBox={currentBox}
        isSaving={updateBoxMutation.isPending}
        isSealing={sealMutation.isPending}
        isCreating={createBoxMutation.isPending}
        onBoxNoChange={setBoxNoDraft}
        onBoxNameChange={setBoxName}
        onSizeLabelChange={(nextSizeLabel) => {
          setSizeLabel(nextSizeLabel);
          const preset = boxSizePresets.find((item) => item.label === nextSizeLabel);
          if (preset) {
            setManualSize({
              length: preset.length,
              width: preset.width,
              height: preset.height,
            });
          }
          if (nextSizeLabel === customSizePreset) {
            setManualSizeOpen(true);
          }
        }}
        onManualSizeOpenChange={setManualSizeOpen}
        onManualSizeChange={setManualSize}
        onWeightChange={setWeight}
        onNoteChange={setNote}
        onSave={() => updateBoxMutation.mutate()}
        onSeal={() => sealMutation.mutate(currentBox?.id)}
        onCreate={() => createBoxMutation.mutate()}
      />

      {message ? <div className="inline-success">{message}</div> : null}
      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}

      <div className="outbound-workbench-grid">
        <InventoryPackingTable
          items={availableItems}
          total={availableTotal}
          page={availablePage}
          pageSize={availablePageSize}
          search={inventorySearch}
          canAdd={Boolean(currentBox && canMutateCurrentBox)}
          isAdding={addItemMutation.isPending || batchAddItemsMutation.isPending}
          selectedItemIds={selectedAvailableItemIds}
          onSearchChange={setInventorySearch}
          onSelectionChange={setSelectedAvailableItemIds}
          onPageChange={setAvailablePage}
          onPageSizeChange={(nextPageSize) => {
            setAvailablePageSize(nextPageSize);
            setAvailablePage(1);
          }}
          onAdd={(item) => addItemMutation.mutate(item.id)}
          onBatchAdd={(items) => batchAddItemsMutation.mutate(items.map((item) => item.id))}
        />
        <CurrentBoxWorkspace
          box={currentBox}
          items={visibleCurrentBoxItems}
          filteredTotal={filteredCurrentBoxItems.length}
          page={boxItemsPage}
          pageSize={boxItemsPageSize}
          search={boxSearch}
          canMutate={canMutateCurrentBox}
          selectedItemIds={selectedBoxItemIds}
          highlightedItemId={highlightedItemId}
          removedItemIds={removedItemIds}
          isRemoving={removeItemMutation.isPending || bulkRemoveMutation.isPending}
          onSearchChange={setBoxSearch}
          onSelectionChange={setSelectedBoxItemIds}
          onPageChange={setBoxItemsPage}
          onPageSizeChange={(nextPageSize) => {
            setBoxItemsPageSize(nextPageSize);
            setBoxItemsPage(1);
          }}
          onDetail={() => currentBox && openBoxDetail(currentBox)}
          onRemove={(item) => removeItemMutation.mutate(item)}
          onBulkRemove={(items) => bulkRemoveMutation.mutate(items)}
          onReorder={() => setMessage('已按加入时间重新排序')}
        />
      </div>

      <CreatedBoxList
        boxes={createdBoxes}
        total={boxes?.total ?? 0}
        page={boxesPage}
        pageSize={boxesPageSize}
        bouncingBoxId={bouncingBoxId}
        isRefreshing={boxesQuery.isFetching}
        isSealing={sealMutation.isPending}
        isReopening={reopenMutation.isPending}
        isDeleting={deleteBoxesMutation.isPending}
        selectedBoxIds={selectedCreatedBoxIds}
        onRefresh={() => boxesQuery.refetch()}
        onPageChange={setBoxesPage}
        onSelectionChange={setSelectedCreatedBoxIds}
        onRequestDelete={() => setDeleteBoxesConfirmOpen(true)}
        onOpenDetail={openBoxDetail}
        onEdit={(box) => {
          void loadFullBox(box)
            .then(setCurrentBox)
            .catch((error) => setErrorMessage(toUserErrorMessage(error, '读取箱子失败')));
        }}
        onSeal={(box) => {
          setCurrentBox(box);
          sealMutation.mutate(box.id);
        }}
        onReopen={(box) => reopenMutation.mutate(box.id)}
      />

      <DeleteBoxesConfirmModal
        boxes={selectedCreatedBoxes}
        open={deleteBoxesConfirmOpen}
        isDeleting={deleteBoxesMutation.isPending}
        onClose={() => setDeleteBoxesConfirmOpen(false)}
        onConfirm={() => deleteBoxesMutation.mutate(selectedCreatedBoxes)}
      />

      <BoxDetailModal
        box={detailBox}
        availableItems={availableItems}
        canMutate={detailBox?.id === currentBox?.id && canMutateCurrentBox}
        isRemoving={removeItemMutation.isPending}
        onClose={() => setDetailBox(null)}
        onRemove={(item) => removeItemMutation.mutate(item)}
      />
    </section>
  );
}

function TrackingSearchBar(props: {
  customers: CustomerOption[];
  customerId: string;
  trackingSearch: string;
  isSearching: boolean;
  onCustomerChange: (customerId: string) => void;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
}) {
  return (
    <section className="outbound-topbar">
      <div className="outbound-title-block">
        <p>Outbound</p>
        <h1>出库装箱工作台</h1>
      </div>
      <label className="outbound-control outbound-customer-select">
        <span>客户</span>
        <select
          value={props.customerId}
          onChange={(event) => props.onCustomerChange(event.target.value)}
        >
          {props.customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.label}
            </option>
          ))}
        </select>
      </label>
      <div className="outbound-search-group">
        <label className="outbound-search-control">
          <Search size={16} />
          <input
            value={props.trackingSearch}
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder="搜索 UPS / FedEx / USPS 单号"
          />
        </label>
        <button
          type="button"
          className="outbound-btn outbound-btn-primary"
          onClick={props.onSearch}
        >
          <Search size={16} />
          {props.isSearching ? '搜索中' : '搜索'}
        </button>
        <span className="outbound-search-hint">支持 UPS、FedEx、USPS 单号自动识别</span>
      </div>
    </section>
  );
}

function BoxQuickEditor(props: {
  boxNo: string;
  boxName: string;
  sizeLabel: string;
  manualSize: { length: number; width: number; height: number };
  manualSizeOpen: boolean;
  weight: string;
  note: string;
  currentBox: PackingBox | null;
  isSaving: boolean;
  isSealing: boolean;
  isCreating: boolean;
  onBoxNoChange: (value: string) => void;
  onBoxNameChange: (value: string) => void;
  onSizeLabelChange: (value: string) => void;
  onManualSizeOpenChange: (value: boolean) => void;
  onManualSizeChange: (value: { length: number; width: number; height: number }) => void;
  onWeightChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onSeal: () => void;
  onCreate: () => void;
}) {
  const canEdit = !props.currentBox || props.currentBox.status !== 'sealed';
  return (
    <section className="outbound-quick-editor">
      <div className="outbound-section-heading compact">
        <h2>当前箱子 / 快速创建</h2>
        <StatusBadge status={props.currentBox?.status ?? 'draft'} />
      </div>
      <div className="outbound-quick-fields">
        <label className="outbound-control compact">
          <span>Box 编号</span>
          <input
            value={props.boxNo}
            onChange={(event) => props.onBoxNoChange(event.target.value)}
          />
        </label>
        <label className="outbound-control wide">
          <span>箱子名称</span>
          <input
            value={props.boxName}
            onChange={(event) => props.onBoxNameChange(event.target.value)}
            placeholder="Apex Trading - 第四箱"
            disabled={!canEdit}
          />
        </label>
        <label className="outbound-control medium">
          <span>尺寸预设</span>
          <select
            value={props.sizeLabel}
            onChange={(event) => props.onSizeLabelChange(event.target.value)}
            disabled={!canEdit}
          >
            {boxSizePresets.map((preset) => (
              <option key={preset.label} value={preset.label}>
                {preset.label}
              </option>
            ))}
            <option value={customSizePreset}>Custom</option>
          </select>
        </label>
        <button
          type="button"
          className="outbound-inline-link"
          disabled={!canEdit}
          onClick={() => props.onManualSizeOpenChange(!props.manualSizeOpen)}
        >
          手动调整
        </button>
        {props.manualSizeOpen ? (
          <div className="outbound-manual-size">
            <NumberField
              label="长"
              value={props.manualSize.length}
              onChange={(value) => props.onManualSizeChange({ ...props.manualSize, length: value })}
            />
            <NumberField
              label="宽"
              value={props.manualSize.width}
              onChange={(value) => props.onManualSizeChange({ ...props.manualSize, width: value })}
            />
            <NumberField
              label="高"
              value={props.manualSize.height}
              onChange={(value) => props.onManualSizeChange({ ...props.manualSize, height: value })}
            />
          </div>
        ) : null}
        <label className="outbound-control compact">
          <span>重量</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={props.weight}
            onChange={(event) => props.onWeightChange(event.target.value)}
            disabled={!canEdit}
          />
        </label>
        <label className="outbound-control note">
          <span>备注</span>
          <input
            value={props.note}
            onChange={(event) => props.onNoteChange(event.target.value)}
            placeholder="如：易碎、请勿挤压"
            disabled={!canEdit}
          />
        </label>
        <div className="outbound-quick-actions">
          <button
            type="button"
            className="outbound-btn outbound-btn-outline"
            disabled={!props.currentBox || !canEdit || props.isSaving}
            onClick={props.onSave}
          >
            <Save size={16} />
            暂存
          </button>
          <button
            type="button"
            className="outbound-btn outbound-btn-success"
            disabled={!props.currentBox || props.currentBox.itemCount === 0 || props.isSealing}
            onClick={props.onSeal}
          >
            <ShieldCheck size={16} />
            确认封箱
          </button>
          <button
            type="button"
            className="outbound-btn outbound-btn-primary"
            disabled={props.isCreating}
            onClick={props.onCreate}
          >
            <Box size={16} />
            新建箱子
          </button>
        </div>
      </div>
    </section>
  );
}

function InventoryPackingTable(props: {
  items: PackingItem[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  canAdd: boolean;
  isAdding: boolean;
  selectedItemIds: Set<string>;
  onSearchChange: (value: string) => void;
  onSelectionChange: (value: Set<string>) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onAdd: (item: PackingItem) => void;
  onBatchAdd: (items: PackingItem[]) => void;
}) {
  const selectedItems = props.items.filter((item) => props.selectedItemIds.has(item.id));
  const allVisibleSelected =
    props.items.length > 0 && props.items.every((item) => props.selectedItemIds.has(item.id));
  const toggleVisibleSelection = (checked: boolean) => {
    props.onSelectionChange(
      checked
        ? new Set([...Array.from(props.selectedItemIds), ...props.items.map((item) => item.id)])
        : new Set(
            Array.from(props.selectedItemIds).filter(
              (id) => !props.items.some((item) => item.id === id),
            ),
          ),
    );
  };
  const toggleItemSelection = (itemId: string, checked: boolean) => {
    const next = new Set(props.selectedItemIds);
    if (checked) {
      next.add(itemId);
    } else {
      next.delete(itemId);
    }
    props.onSelectionChange(next);
  };

  return (
    <section className="outbound-panel outbound-operation-panel">
      <div className="outbound-section-heading">
        <div>
          <h2>客户库存 / 可装箱货物</h2>
          <span>
            当前客户可装箱货物
            {selectedItems.length ? ` · 已选 ${selectedItems.length} 件` : ''}
          </span>
        </div>
        <label className="outbound-mini-search">
          <Search size={15} />
          <input
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder="搜索单号、IMEI/Serial 或货物信息"
          />
        </label>
      </div>
      <div className="outbound-box-footer compact">
        <button
          type="button"
          className="outbound-btn outbound-btn-primary"
          disabled={!props.canAdd || selectedItems.length === 0 || props.isAdding}
          onClick={() => props.onBatchAdd(selectedItems)}
        >
          <PackagePlus size={16} />
          批量装箱 {selectedItems.length ? `${selectedItems.length} 件` : ''}
        </button>
      </div>
      <div className="outbound-table-wrap">
        <table className="outbound-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="选择当前页可装箱货物"
                  checked={allVisibleSelected}
                  disabled={props.items.length === 0}
                  onChange={(event) => toggleVisibleSelection(event.target.checked)}
                />
              </th>
              <th>物流单号</th>
              <th>货物信息</th>
              <th>IMEI / Serial</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`选择 ${item.imeiOrSerial ?? item.trackingNumber}`}
                    checked={props.selectedItemIds.has(item.id)}
                    onChange={(event) => toggleItemSelection(item.id, event.target.checked)}
                  />
                </td>
                <td>
                  <strong className="mono">{item.trackingNumber || '-'}</strong>
                  <span>{item.carrier}</span>
                </td>
                <td>
                  <strong>{item.productName ?? '-'}</strong>
                  <span>UPC {item.upc ?? '-'}</span>
                </td>
                <td className="mono">{item.imeiOrSerial ?? '-'}</td>
                <td>
                  <ItemStatusBadge status={item.status} />
                </td>
                <td>
                  <button
                    type="button"
                    className="outbound-table-btn"
                    disabled={!props.canAdd || props.isAdding}
                    onClick={() => props.onAdd(item)}
                  >
                    <PackagePlus size={15} />
                    加入箱子
                  </button>
                </td>
              </tr>
            ))}
            {props.items.length === 0 ? (
              <tr>
                <td colSpan={6}>没有匹配的可装箱货物</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <WorkbenchPagination
        total={props.total}
        page={props.page}
        pageSize={props.pageSize}
        pageSizeOptions={[10, 20, 50]}
        onPageChange={props.onPageChange}
        onPageSizeChange={props.onPageSizeChange}
      />
    </section>
  );
}

function CurrentBoxWorkspace(props: {
  box: PackingBox | null;
  items: PackingItem[];
  filteredTotal: number;
  page: number;
  pageSize: number;
  search: string;
  canMutate: boolean;
  selectedItemIds: Set<string>;
  highlightedItemId: string | null;
  removedItemIds: Set<string>;
  isRemoving: boolean;
  onSearchChange: (value: string) => void;
  onSelectionChange: (value: Set<string>) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onDetail: () => void;
  onRemove: (item: PackingItem) => void;
  onBulkRemove: (items: PackingItem[]) => void;
  onReorder: () => void;
}) {
  const imeiCount = props.box?.items.filter((item) => item.imeiOrSerial).length ?? 0;
  const selectedItems = props.items.filter((item) => props.selectedItemIds.has(item.id));
  const allVisibleSelected =
    props.items.length > 0 && props.items.every((item) => props.selectedItemIds.has(item.id));
  const toggleVisibleSelection = (checked: boolean) => {
    props.onSelectionChange(
      checked
        ? new Set([...Array.from(props.selectedItemIds), ...props.items.map((item) => item.id)])
        : new Set(
            Array.from(props.selectedItemIds).filter(
              (id) => !props.items.some((item) => item.id === id),
            ),
          ),
    );
  };
  const toggleItemSelection = (itemId: string, checked: boolean) => {
    const next = new Set(props.selectedItemIds);
    if (checked) {
      next.add(itemId);
    } else {
      next.delete(itemId);
    }
    props.onSelectionChange(next);
  };
  return (
    <section className="outbound-panel outbound-operation-panel current-box-panel">
      <div className="outbound-section-heading">
        <div>
          <h2>当前箱子工作区</h2>
          <span>{props.box ? props.box.boxNo : '尚未选择箱子'}</span>
        </div>
        <label className="outbound-mini-search">
          <Search size={15} />
          <input
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder="搜索当前箱内货物（单号 / IMEI / 货物信息）"
          />
        </label>
      </div>
      <div className="outbound-box-summary">
        <SummaryTile label="总货物" value={props.box?.itemCount ?? 0} />
        <SummaryTile label="IMEI / Serial" value={imeiCount} />
        <SummaryTile
          label="当前状态"
          value={<StatusBadge status={props.box?.status ?? 'draft'} />}
          className="status"
        />
      </div>
      <div className="outbound-table-wrap">
        <table className="outbound-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="选择当前页箱内货物"
                  checked={allVisibleSelected}
                  disabled={!props.canMutate || props.items.length === 0}
                  onChange={(event) => toggleVisibleSelection(event.target.checked)}
                />
              </th>
              <th>物流单号</th>
              <th>货物信息</th>
              <th>IMEI / Serial</th>
              <th>加入时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => (
              <tr
                key={item.id}
                className={[
                  props.highlightedItemId === item.id ? 'row-highlight' : '',
                  props.removedItemIds.has(item.id) ? 'row-removing' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <td>
                  <input
                    type="checkbox"
                    aria-label={`选择 ${item.imeiOrSerial ?? item.trackingNumber}`}
                    checked={props.selectedItemIds.has(item.id)}
                    disabled={!props.canMutate}
                    onChange={(event) => toggleItemSelection(item.id, event.target.checked)}
                  />
                </td>
                <td>
                  <strong className="mono">{item.trackingNumber || '-'}</strong>
                  <span>{item.carrier}</span>
                </td>
                <td>
                  <strong>{item.productName ?? '-'}</strong>
                  <span>UPC {item.upc ?? '-'}</span>
                </td>
                <td className="mono">{item.imeiOrSerial ?? '-'}</td>
                <td>{formatShortDateTime(item.addedAt)}</td>
                <td>
                  <button
                    type="button"
                    className="outbound-table-btn danger"
                    disabled={!props.canMutate || props.isRemoving}
                    onClick={() => props.onRemove(item)}
                  >
                    <Trash2 size={15} />
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {!props.box || props.items.length === 0 ? (
              <tr>
                <td colSpan={6}>当前箱子暂无货物</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="outbound-box-footer">
        <button
          type="button"
          className="outbound-btn outbound-btn-outline"
          onClick={props.onDetail}
        >
          <Eye size={16} />
          查看明细
        </button>
        <button
          type="button"
          className="outbound-btn outbound-btn-danger"
          disabled={!props.canMutate || selectedItems.length === 0 || props.isRemoving}
          onClick={() => props.onBulkRemove(selectedItems)}
        >
          <Trash2 size={16} />
          批量删除 {selectedItems.length} 件
        </button>
        <button
          type="button"
          className="outbound-btn outbound-btn-outline"
          onClick={props.onReorder}
        >
          <ArrowDownUp size={16} />
          重新排序
        </button>
      </div>
      <WorkbenchPagination
        total={props.filteredTotal}
        page={props.page}
        pageSize={props.pageSize}
        pageSizeOptions={[10, 20, 50]}
        onPageChange={props.onPageChange}
        onPageSizeChange={props.onPageSizeChange}
        compact
      />
    </section>
  );
}

function CreatedBoxList(props: {
  boxes: PackingBox[];
  total: number;
  page: number;
  pageSize: number;
  bouncingBoxId: string | null;
  isRefreshing: boolean;
  isSealing: boolean;
  isReopening: boolean;
  isDeleting: boolean;
  selectedBoxIds: Set<string>;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
  onSelectionChange: (value: Set<string>) => void;
  onRequestDelete: () => void;
  onOpenDetail: (box: PackingBox) => void;
  onEdit: (box: PackingBox) => void;
  onSeal: (box: PackingBox) => void;
  onReopen: (box: PackingBox) => void;
}) {
  const selectedCount = props.selectedBoxIds.size;
  const toggleBoxSelection = (boxId: string) => {
    const next = new Set(props.selectedBoxIds);
    if (next.has(boxId)) {
      next.delete(boxId);
    } else {
      next.add(boxId);
    }
    props.onSelectionChange(next);
  };
  return (
    <section className="outbound-panel created-boxes-panel">
      <div className="outbound-section-heading">
        <div>
          <h2>已创建箱子</h2>
          <span>
            点击卡片选中箱子
            {selectedCount ? ` · 已选 ${selectedCount} 个` : ''}
          </span>
        </div>
        <div className="created-box-toolbar">
          <button
            type="button"
            className="outbound-btn outbound-btn-danger"
            disabled={selectedCount === 0 || props.isDeleting}
            onClick={props.onRequestDelete}
          >
            <Trash2 size={16} />
            删除选中
          </button>
          <button
            type="button"
            className="outbound-btn outbound-btn-outline"
            disabled={props.isRefreshing}
            onClick={props.onRefresh}
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
      </div>
      <div className="created-box-list">
        {props.boxes.map((box) => (
          <CreatedBoxCard
            key={box.id}
            box={box}
            isSelected={props.selectedBoxIds.has(box.id)}
            isBouncing={props.bouncingBoxId === box.id}
            isSealing={props.isSealing}
            isReopening={props.isReopening}
            onToggleSelected={() => toggleBoxSelection(box.id)}
            onOpenDetail={() => props.onOpenDetail(box)}
            onEdit={() => props.onEdit(box)}
            onSeal={() => props.onSeal(box)}
            onReopen={() => props.onReopen(box)}
          />
        ))}
        {props.boxes.length === 0 ? <div className="created-box-empty">暂无已创建箱子</div> : null}
      </div>
      <WorkbenchPagination
        total={props.total}
        page={props.page}
        pageSize={props.pageSize}
        pageSizeOptions={[8]}
        onPageChange={props.onPageChange}
      />
    </section>
  );
}

function CreatedBoxCard(props: {
  box: PackingBox;
  isSelected: boolean;
  isBouncing: boolean;
  isSealing: boolean;
  isReopening: boolean;
  onToggleSelected: () => void;
  onOpenDetail: () => void;
  onEdit: () => void;
  onSeal: () => void;
  onReopen: () => void;
}) {
  const imeiCount = props.box.items.filter((item) => item.imeiOrSerial).length;
  return (
    <article
      className={`created-box-card ${props.isSelected ? 'selected' : ''}`}
      onClick={props.onToggleSelected}
    >
      <div className="created-box-select-indicator">
        <input
          type="checkbox"
          aria-label={`选择 ${props.box.boxNo}`}
          checked={props.isSelected}
          onChange={props.onToggleSelected}
          onClick={(event) => event.stopPropagation()}
        />
        <span>{props.isSelected ? '已选中' : '点击选中'}</span>
      </div>
      <button
        type="button"
        className={`created-box-icon ${props.isBouncing ? 'open' : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          props.onOpenDetail();
        }}
        aria-label={`查看 ${props.box.boxNo} 明细`}
      >
        <Archive size={24} />
      </button>
      <div className="created-box-card-head">
        <strong>{props.box.boxNo}</strong>
        <StatusBadge status={props.box.status} />
      </div>
      <div className="created-box-meta">
        <span>尺寸：{props.box.sizeLabel}</span>
        <span>
          重量：{props.box.weight} {props.box.weightUnit}
        </span>
      </div>
      <div className="created-box-copy">
        <strong>箱子名称：{props.box.name || '-'}</strong>
        <span>备注：{props.box.note || '-'}</span>
      </div>
      <div className="created-box-stats">
        <span>货物数量：{props.box.itemCount}</span>
        <span>IMEI / Serial：{imeiCount}</span>
      </div>
      <div className="created-box-actions">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            props.onOpenDetail();
          }}
        >
          查看明细
        </button>
        {props.box.status === 'draft' ? (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                props.onEdit();
              }}
            >
              继续编辑
            </button>
            <button
              type="button"
              disabled={props.isSealing}
              onClick={(event) => {
                event.stopPropagation();
                props.onSeal();
              }}
            >
              确认封箱
            </button>
          </>
        ) : null}
        {props.box.status === 'sealed' ? (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                props.onOpenDetail();
              }}
            >
              查看
            </button>
            <button
              type="button"
              disabled={props.isReopening}
              onClick={(event) => {
                event.stopPropagation();
                props.onReopen();
              }}
            >
              返工
            </button>
          </>
        ) : null}
        {props.box.status === 'rework' ? (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                props.onEdit();
              }}
            >
              继续返工
            </button>
            <button
              type="button"
              disabled={props.isSealing}
              onClick={(event) => {
                event.stopPropagation();
                props.onSeal();
              }}
            >
              重新封箱
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}

function DeleteBoxesConfirmModal(props: {
  boxes: PackingBox[];
  open: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!props.open) {
    return null;
  }
  const sealedCount = props.boxes.filter((box) => box.status === 'sealed').length;
  const itemCount = props.boxes.reduce((sum, box) => sum + box.itemCount, 0);
  return (
    <div className="outbound-modal-backdrop compact" role="presentation" onClick={props.onClose}>
      <section
        className="outbound-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="确认删除箱子"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="outbound-modal-head">
          <div>
            <p>Delete Boxes</p>
            <h2>确认删除已选箱子？</h2>
          </div>
          <button type="button" className="outbound-modal-close" onClick={props.onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="outbound-confirm-body">
          <p>
            将删除 {props.boxes.length} 个箱子，箱内 {itemCount}{' '}
            件货物会退回客户库存。这个操作会写入审计日志。
          </p>
          {sealedCount ? (
            <div className="outbound-confirm-warning">
              已选中 {sealedCount} 个已封箱箱子。已封箱箱子不能直接删除，请先返工后再删除。
            </div>
          ) : null}
          <ul>
            {props.boxes.map((box) => (
              <li key={box.id}>
                <strong>{box.boxNo}</strong>
                <span>{box.name || '-'}</span>
                <StatusBadge status={box.status} />
              </li>
            ))}
          </ul>
        </div>
        <div className="outbound-confirm-actions">
          <button
            type="button"
            className="outbound-btn outbound-btn-outline"
            onClick={props.onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="outbound-btn outbound-btn-danger"
            disabled={props.isDeleting || props.boxes.length === 0}
            onClick={props.onConfirm}
          >
            <Trash2 size={16} />
            确认删除
          </button>
        </div>
      </section>
    </div>
  );
}

function BoxDetailModal(props: {
  box: PackingBox | null;
  availableItems: PackingItem[];
  canMutate: boolean;
  isRemoving: boolean;
  onClose: () => void;
  onRemove: (item: PackingItem) => void;
}) {
  if (!props.box) {
    return null;
  }
  const carrierCounts = props.box.items.reduce(
    (counts, item) => {
      counts[item.carrier] += 1;
      return counts;
    },
    { UPS: 0, FedEx: 0, USPS: 0 } as Record<Carrier, number>,
  );
  const imeiCount = props.box.items.filter((item) => item.imeiOrSerial).length;
  const upcSummaries = summarizeByUpc(props.box.items, props.availableItems);
  return (
    <div className="outbound-modal-backdrop" role="presentation" onClick={props.onClose}>
      <section
        className="outbound-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${props.box.boxNo} 明细`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="outbound-modal-head">
          <div>
            <p>Box Detail</p>
            <h2>{props.box.boxNo} 明细</h2>
          </div>
          <button type="button" className="outbound-modal-close" onClick={props.onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="outbound-detail-summary">
          <span>箱子名称：{props.box.name || '-'}</span>
          <span>
            状态：
            <StatusBadge status={props.box.status} />
          </span>
          <span>尺寸：{props.box.sizeLabel}</span>
          <span>
            重量：{props.box.weight} {props.box.weightUnit}
          </span>
          <span>备注：{props.box.note || '-'}</span>
          <span>总货物数量：{props.box.itemCount}</span>
          <span>总 IMEI / Serial 数量：{imeiCount}</span>
          <span>UPS 数量：{carrierCounts.UPS}</span>
          <span>FedEx 数量：{carrierCounts.FedEx}</span>
          <span>USPS 数量：{carrierCounts.USPS}</span>
        </div>
        <div className="outbound-product-summary">
          <div className="outbound-product-summary-head">
            <h3>UPC 货物汇总</h3>
            <span>所有明细汇总统一按 UPC 统计</span>
          </div>
          <div className="outbound-product-summary-grid">
            {upcSummaries.map((summary) => (
              <article key={summary.key} className="outbound-product-summary-card">
                <strong>{summary.productName}</strong>
                <span className="mono">UPC {summary.upc}</span>
                <div>
                  <span>箱内数量 {summary.packedCount}</span>
                  <span>剩余可装箱 {summary.availableCount}</span>
                  <span>IMEI / Serial {summary.imeiCount}</span>
                </div>
                <small>
                  UPS {summary.carriers.UPS} · FedEx {summary.carriers.FedEx} · USPS{' '}
                  {summary.carriers.USPS}
                </small>
              </article>
            ))}
            {upcSummaries.length === 0 ? (
              <div className="outbound-product-summary-empty">暂无可汇总货物</div>
            ) : null}
          </div>
        </div>
        <div className="outbound-table-wrap modal-table">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>物流类型</th>
                <th>物流单号</th>
                <th>UPC</th>
                <th>商品名称</th>
                <th>IMEI / Serial</th>
                <th>客户</th>
                <th>加入时间</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {props.box.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.carrier}</td>
                  <td className="mono">{item.trackingNumber || '-'}</td>
                  <td className="mono">{item.upc ?? '-'}</td>
                  <td>{item.productName ?? '-'}</td>
                  <td className="mono">{item.imeiOrSerial ?? '-'}</td>
                  <td>{item.customerName}</td>
                  <td>{formatShortDateTime(item.addedAt)}</td>
                  <td>
                    <ItemStatusBadge status={item.status} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="outbound-table-btn danger"
                      disabled={!props.canMutate || props.isRemoving}
                      onClick={() => props.onRemove(item)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {props.box.items.length === 0 ? (
                <tr>
                  <td colSpan={9}>箱子里暂无货物</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function WorkbenchPagination(props: {
  total: number;
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  compact?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize));
  const pages = getVisiblePages(props.page, totalPages);
  return (
    <div className={`outbound-pagination ${props.compact ? 'compact' : ''}`}>
      <span>共 {props.total} 条</span>
      {props.onPageSizeChange ? (
        <select
          value={props.pageSize}
          onChange={(event) => props.onPageSizeChange?.(Number(event.target.value))}
        >
          {props.pageSizeOptions.map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              {pageSize} / 页
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        disabled={props.page <= 1}
        onClick={() => props.onPageChange(props.page - 1)}
      >
        上一页
      </button>
      {pages.map((page, index) =>
        page === 'ellipsis' ? (
          <span key={`${page}-${index}`}>...</span>
        ) : (
          <button
            key={page}
            type="button"
            className={page === props.page ? 'active' : ''}
            onClick={() => props.onPageChange(page)}
          >
            {page}
          </button>
        ),
      )}
      <button
        type="button"
        disabled={props.page >= totalPages}
        onClick={() => props.onPageChange(props.page + 1)}
      >
        下一页
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: BoxStatus }) {
  const labelMap: Record<BoxStatus, string> = {
    draft: '未封箱',
    sealed: '已封箱',
    rework: '返工中',
  };
  return <span className={`outbound-status ${status}`}>{labelMap[status]}</span>;
}

function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const labelMap: Record<ItemStatus, string> = {
    available: '待装箱',
    packed: '已装箱',
    exception: '异常',
  };
  return <span className={`outbound-item-status ${status}`}>{labelMap[status]}</span>;
}

function SummaryTile(props: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={`outbound-summary-tile ${props.className ?? ''}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function NumberField(props: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      <span>{props.label}</span>
      <input
        type="number"
        min="1"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value) || 1)}
      />
    </label>
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
  customer?: { id: string; name: string };
  product: { name: string };
};
type OutboundBox = {
  id: string;
  boxNo: string;
  boxName?: string | null;
  sizePreset?: string | null;
  customSize?: string | null;
  weightLb?: number | null;
  status: string;
  itemCount: number;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  sealedAt?: string | null;
  customer?: { id: string; code?: string; name: string };
  items: Array<{
    id: string;
    inventoryItemId?: string;
    packedAt?: string;
    inventoryItem: {
      id: string;
      upsTrackingNo: string | null;
      upc: string;
      imei: string | null;
      serial: string | null;
      status: string;
      customer?: { id: string; name: string };
      product: { name: string };
    };
  }>;
};

function upsertBoxListResult(
  current: BoxListResult | undefined,
  box: OutboundBox,
): BoxListResult | undefined {
  if (!current) {
    return current;
  }
  const existingIndex = current.items.findIndex((item) => item.id === box.id);
  if (existingIndex === -1) {
    return {
      ...current,
      items: [box, ...current.items].slice(0, current.pageSize),
      total: current.total + 1,
    };
  }
  return {
    ...current,
    items: current.items.map((item) => (item.id === box.id ? box : item)),
  };
}

function removeBoxesFromListResult(
  current: BoxListResult | undefined,
  deletedIds: Set<string>,
): BoxListResult | undefined {
  if (!current) {
    return current;
  }
  const removedCount = current.items.filter((item) => deletedIds.has(item.id)).length;
  return {
    ...current,
    items: current.items.filter((item) => !deletedIds.has(item.id)),
    total: Math.max(0, current.total - removedCount),
  };
}

function toPackingItem(item: AvailableItem, selectedCustomer?: CustomerOption): PackingItem {
  return {
    id: item.id,
    carrier: detectCarrier(item.upsTrackingNo),
    trackingNumber: item.upsTrackingNo ?? '',
    upc: item.upc,
    productName: item.product.name,
    imeiOrSerial: item.imei ?? item.serial ?? undefined,
    customerId: item.customer?.id ?? selectedCustomer?.id ?? '',
    customerName: item.customer?.name ?? selectedCustomer?.label ?? '-',
    status: toItemStatus(item.status),
    raw: item,
  };
}

function toPackingBox(box: OutboundBox, reworkBoxIds: Set<string>): PackingBox {
  const status = toBoxStatus(box, reworkBoxIds);
  const size = parseBoxSize(box.sizePreset, box.customSize);
  return {
    id: box.id,
    boxNo: box.boxNo,
    name: box.boxName ?? '',
    status,
    sizeLabel: size.label,
    length: size.length,
    width: size.width,
    height: size.height,
    weight: box.weightLb ?? defaultBoxWeight,
    weightUnit: 'lb',
    note: box.notes ?? undefined,
    itemCount: box.itemCount,
    items: box.items.map((item) => ({
      id: item.inventoryItem.id,
      boxItemId: item.id,
      carrier: detectCarrier(item.inventoryItem.upsTrackingNo),
      trackingNumber: item.inventoryItem.upsTrackingNo ?? '',
      upc: item.inventoryItem.upc,
      productName: item.inventoryItem.product.name,
      imeiOrSerial: item.inventoryItem.imei ?? item.inventoryItem.serial ?? undefined,
      customerId: item.inventoryItem.customer?.id ?? box.customer?.id ?? '',
      customerName: item.inventoryItem.customer?.name ?? box.customer?.name ?? '-',
      status: 'packed',
      addedAt: item.packedAt,
      raw: item,
    })),
    createdAt: box.createdAt ?? '',
    updatedAt: box.updatedAt ?? box.createdAt ?? '',
    sealedAt: box.sealedAt,
    raw: box,
  };
}

function toBoxStatus(box: OutboundBox, reworkBoxIds: Set<string>): BoxStatus {
  if (box.status === 'SEALED') {
    return 'sealed';
  }
  if (reworkBoxIds.has(box.id)) {
    return 'rework';
  }
  return 'draft';
}

function toItemStatus(status: string): ItemStatus {
  if (status === 'EXCEPTION') {
    return 'exception';
  }
  if (status === 'PACKED') {
    return 'packed';
  }
  return 'available';
}

function detectCarrier(value?: string | null): Carrier {
  const tracking = value?.replace(/\s+/g, '').toUpperCase() ?? '';
  if (tracking.startsWith('1Z')) {
    return 'UPS';
  }
  if (/^(94|92|93|95|96|97)\d{18,32}$/.test(tracking)) {
    return 'USPS';
  }
  return 'FedEx';
}

function parseBoxSize(sizePreset?: string | null, customSize?: string | null): BoxSizePreset {
  const normalized = (customSize || sizePreset || '').replace(/\*/g, ' × ');
  const matched = boxSizePresets.find(
    (preset) => preset.label === normalized || preset.label.startsWith(`${normalized} `),
  );
  if (matched) {
    return matched;
  }
  const numbers = normalized.match(/\d+(\.\d+)?/g)?.map(Number);
  if (numbers && numbers.length >= 3) {
    const [length, width, height] = numbers as [number, number, number, ...number[]];
    return {
      label: `${length} × ${width} × ${height} in`,
      length,
      width,
      height,
      unit: 'in',
    };
  }
  return defaultSizePreset;
}

function toBackendBoxSize(
  sizeLabel: string,
  manualSize: { length: number; width: number; height: number },
) {
  const preset = boxSizePresets.find((item) => item.label === sizeLabel);
  const size = preset ?? { ...manualSize, label: customSizePreset, unit: 'in' as const };
  const customSize = `${size.length}*${size.width}*${size.height}`;
  if (size.label === '12 × 12 × 12 in') {
    return { sizePreset: '12*12*12' };
  }
  if (size.label === '14 × 14 × 14 in') {
    return { sizePreset: '14*14*14' };
  }
  return { sizePreset: 'CUSTOM', customSize };
}

function summarizeByUpc(boxItems: PackingItem[], availableItems: PackingItem[]) {
  const summaries = new Map<
    string,
    {
      key: string;
      productName: string;
      upc: string;
      packedCount: number;
      availableCount: number;
      imeiCount: number;
      carriers: Record<Carrier, number>;
    }
  >();

  for (const item of boxItems) {
    const productName = item.productName || '未命名商品';
    const upc = item.upc || '-';
    const key = upc;
    const current =
      summaries.get(key) ??
      ({
        key,
        productName,
        upc,
        packedCount: 0,
        availableCount: 0,
        imeiCount: 0,
        carriers: { UPS: 0, FedEx: 0, USPS: 0 },
      } satisfies {
        key: string;
        productName: string;
        upc: string;
        packedCount: number;
        availableCount: number;
        imeiCount: number;
        carriers: Record<Carrier, number>;
      });

    current.packedCount += 1;
    current.imeiCount += item.imeiOrSerial ? 1 : 0;
    current.carriers[item.carrier] += 1;
    summaries.set(key, current);
  }

  for (const item of availableItems) {
    const upc = item.upc || '-';
    const current = summaries.get(upc);
    if (current) {
      current.availableCount += 1;
    }
  }

  return Array.from(summaries.values()).sort((a, b) => b.packedCount - a.packedCount);
}

function toWeightNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultBoxWeight;
}

function getVisiblePages(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) {
    pages.push('ellipsis');
  }
  for (let current = start; current <= end; current += 1) {
    pages.push(current);
  }
  if (end < totalPages - 1) {
    pages.push('ellipsis');
  }
  pages.push(totalPages);
  return pages;
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function formatShortDateTime(value?: string | null) {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function toUserErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
