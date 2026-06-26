import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowDownUp,
  Box,
  Camera,
  ClipboardList,
  Eye,
  ImagePlus,
  PackagePlus,
  Printer,
  RefreshCw,
  Save,
  ScanLine,
  Search,
  Send,
  ShieldCheck,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSystemSettings, listWarehouses } from '../../api/settings';
import { customersApi, inventoryApi, outboundApi } from '../../api/workflow';
import { selectDefaultWarehouseId } from '../../utils/default-warehouse';

type Carrier = 'UPS' | 'FedEx' | 'USPS';
type BoxStatus = 'draft' | 'sealed' | 'rework';
type ItemStatus = 'available' | 'packed' | 'outbound' | 'exception' | 'voided';
type WeightUnit = 'lb';
type OutboundPackingMode = 'DETAILED_SCAN' | 'BULK_BOX';
type ProductConditionFilter = 'ALL' | 'NEW' | 'REFURBISHED';
type ProductDeviceFilter = 'ALL' | 'IPHONE' | 'IPAD';

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
  productSku?: string;
  productModel?: string | null;
  productModelCode?: string | null;
  productCategory?: string | null;
  imeiOrSerial?: string;
  customerId: string;
  customerName: string;
  status: ItemStatus;
  availableForOutbound?: boolean;
  receivedAt?: string | null;
  addedAt?: string;
  latestOutboundBox?: LatestOutboundBox | null;
  raw?: AvailableItem | InventorySearchItem | OutboundBox['items'][number];
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
  shippingTrackingNo?: string;
  itemCount: number;
  items: PackingItem[];
  photos: OutboundBoxPhoto[];
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

export function OutboundPackingPage() {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [currentBox, setCurrentBox] = useState<PackingBox | null>(null);
  const [detailBox, setDetailBox] = useState<PackingBox | null>(null);
  const [printDetailBox, setPrintDetailBox] = useState<PackingBox | null>(null);
  const [packingMode, setPackingMode] = useState<OutboundPackingMode>('DETAILED_SCAN');
  const [inventorySearch, setInventorySearch] = useState('');
  const [conditionFilter, setConditionFilter] = useState<ProductConditionFilter>('ALL');
  const [deviceFilter, setDeviceFilter] = useState<ProductDeviceFilter>('ALL');
  const [boxSearch, setBoxSearch] = useState('');
  const [scanValue, setScanValue] = useState('');
  const [scanUpc, setScanUpc] = useState('');
  const [scanImeiOrSerial, setScanImeiOrSerial] = useState('');
  const [scanBlockReason, setScanBlockReason] = useState('');
  const scanAutoSubmitTimerRef = useRef<number | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const [sizeLabel, setSizeLabel] = useState(defaultSizePreset.label);
  const [boxNameDraft, setBoxNameDraft] = useState('');
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
  const [selectedAvailableItemsById, setSelectedAvailableItemsById] = useState<
    Map<string, PackingItem>
  >(() => new Map());
  const [boxItemsPage, setBoxItemsPage] = useState(1);
  const [boxItemsPageSize, setBoxItemsPageSize] = useState(10);
  const [selectedBoxItemIds, setSelectedBoxItemIds] = useState<Set<string>>(() => new Set());
  const [selectedCreatedBoxIds, setSelectedCreatedBoxIds] = useState<Set<string>>(() => new Set());
  const [deleteBoxesConfirmOpen, setDeleteBoxesConfirmOpen] = useState(false);
  const [batchPackingOpen, setBatchPackingOpen] = useState(false);
  const [batchBoxCount, setBatchBoxCount] = useState('2');
  const [batchAllocationCounts, setBatchAllocationCounts] = useState<string[]>(['']);
  const [batchItems, setBatchItems] = useState<PackingItem[]>([]);
  const [isBatchItemsLoading, setIsBatchItemsLoading] = useState(false);
  const [boxesPage, setBoxesPage] = useState(1);
  const [boxesPageSize] = useState(8);
  const [reworkBoxIds, setReworkBoxIds] = useState<Set<string>>(() => new Set());
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [removedItemIds, setRemovedItemIds] = useState<Set<string>>(() => new Set());
  const [locallyPackedInventoryIds, setLocallyPackedInventoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bouncingBoxId, setBouncingBoxId] = useState<string | null>(null);
  const [uploadingPhotoBoxId, setUploadingPhotoBoxId] = useState<string | null>(null);
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

  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const activeInventorySearch = inventorySearch.trim();
  const isBulkPackingMode = packingMode === 'BULK_BOX';
  const activeConditionFilter = isBulkPackingMode ? conditionFilter : 'ALL';
  const activeDeviceFilter = isBulkPackingMode ? deviceFilter : 'ALL';
  const hasActiveBulkProductFilter =
    isBulkPackingMode &&
    !activeInventorySearch &&
    (activeConditionFilter !== 'ALL' || activeDeviceFilter !== 'ALL');
  const availableQueryKey = [
    'outbound-available-items',
    customerId,
    warehouseId,
    activeInventorySearch,
    availablePage,
    availablePageSize,
  ] as const;
  const boxesQueryKey = [
    'outbound-boxes',
    customerId,
    warehouseId,
    boxesPage,
    boxesPageSize,
  ] as const;
  const availableQuery = useQuery({
    queryKey: availableQueryKey,
    queryFn: () => {
      const params = {
        customerId,
        warehouseId,
        page: availablePage,
        pageSize: availablePageSize,
        ...(activeInventorySearch ? { search: activeInventorySearch } : {}),
      };
      if (activeInventorySearch) {
        return inventoryApi.items({
          ...params,
          sortBy: 'updatedAt',
          sortOrder: 'desc',
        });
      }
      return outboundApi.availableItems(params);
    },
    enabled: Boolean(customerId && warehouseId),
  });
  const available = availableQuery.data as InventoryResult | undefined;
  const availableItemsBeforeProductFilters = useMemo(() => {
    const items = available?.items ?? [];
    if (activeInventorySearch) {
      return items.map((item) => toPackingItem(item, selectedCustomer));
    }
    return items
      .filter((item) => !locallyPackedInventoryIds.has(item.id))
      .map((item) => toPackingItem(item, selectedCustomer));
  }, [activeInventorySearch, available?.items, locallyPackedInventoryIds, selectedCustomer]);
  const currentPageAvailableItems = useMemo(
    () =>
      availableItemsBeforeProductFilters.filter((item) =>
        matchesProductFilters(item, activeConditionFilter, activeDeviceFilter),
      ),
    [activeConditionFilter, activeDeviceFilter, availableItemsBeforeProductFilters],
  );
  const locallyHiddenAvailableCount = (available?.items ?? []).filter((item) =>
    locallyPackedInventoryIds.has(item.id),
  ).length;
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
  const fetchAvailablePackingItems = async (params?: {
    search?: string;
    condition?: ProductConditionFilter;
    device?: ProductDeviceFilter;
  }) => {
    const collected: AvailableItem[] = [];
    let page = 1;
    let total = 0;

    do {
      const result = (await outboundApi.availableItems({
        customerId,
        warehouseId,
        page,
        pageSize: 100,
        ...(params?.search ? { search: params.search } : {}),
      })) as unknown as InventoryResult;
      collected.push(...result.items);
      total = result.total;
      page += 1;
    } while (collected.length < total);

    return collected
      .filter((item) => !locallyPackedInventoryIds.has(item.id))
      .map((item) => toPackingItem(item, selectedCustomer))
      .filter((item) =>
        matchesProductFilters(item, params?.condition ?? 'ALL', params?.device ?? 'ALL'),
      );
  };
  const bulkFilteredItemsQuery = useQuery({
    queryKey: [
      'outbound-available-items',
      'bulk-filtered-all',
      customerId,
      warehouseId,
      activeConditionFilter,
      activeDeviceFilter,
      Array.from(locallyPackedInventoryIds).sort().join(','),
    ],
    queryFn: () =>
      fetchAvailablePackingItems({
        condition: activeConditionFilter,
        device: activeDeviceFilter,
      }),
    enabled: Boolean(customerId && warehouseId && hasActiveBulkProductFilter),
  });
  const availableItems = useMemo(() => {
    if (hasActiveBulkProductFilter && bulkFilteredItemsQuery.data) {
      return paginateItems(bulkFilteredItemsQuery.data, availablePage, availablePageSize);
    }
    return currentPageAvailableItems;
  }, [
    availablePage,
    availablePageSize,
    bulkFilteredItemsQuery.data,
    currentPageAvailableItems,
    hasActiveBulkProductFilter,
  ]);
  const availableTotal = hasActiveBulkProductFilter
    ? (bulkFilteredItemsQuery.data?.length ?? available?.total ?? currentPageAvailableItems.length)
    : activeInventorySearch
      ? (available?.total ?? 0)
      : Math.max(0, (available?.total ?? 0) - locallyHiddenAvailableCount);
  const refreshBatchItems = async () => {
    if (!customerId || !warehouseId) return;
    setIsBatchItemsLoading(true);
    setErrorMessage('');
    try {
      const items = await fetchAvailablePackingItems({
        condition: activeConditionFilter,
        device: activeDeviceFilter,
      });
      setBatchItems(items);
    } catch (error) {
      setErrorMessage(toUserErrorMessage(error, '读取可装箱库存失败'));
    } finally {
      setIsBatchItemsLoading(false);
    }
  };
  const focusDetailedScanInput = useCallback(() => {
    window.setTimeout(() => {
      scanInputRef.current?.focus();
      scanInputRef.current?.select();
    }, 0);
  }, []);
  const resetDetailedScan = () => {
    if (scanAutoSubmitTimerRef.current) {
      window.clearTimeout(scanAutoSubmitTimerRef.current);
      scanAutoSubmitTimerRef.current = null;
    }
    setScanValue('');
    setScanUpc('');
    setScanImeiOrSerial('');
    setScanBlockReason('');
    setMessage('已清空扫码');
    setErrorMessage('');
    focusDetailedScanInput();
  };
  const applyScannedValue = (value: string) => {
    if (scanBlockReason || scanPackMutation.isPending) {
      return;
    }
    const normalized = value.trim();
    if (!normalized) {
      return;
    }
    const scanType = classifyOutboundScanValue(normalized);
    const nextUpc = scanType === 'UPC' ? normalized : scanUpc;
    const nextImeiOrSerial = scanType === 'IMEI_SERIAL' ? normalized : scanImeiOrSerial;
    setScanValue('');
    if (scanType === 'UPC') {
      setScanUpc(normalized);
      setMessage('已扫描 UPC，等待 IMEI / Serial');
    } else {
      setScanImeiOrSerial(normalized);
      setMessage('已扫描 IMEI / Serial，等待 UPC');
    }
    setErrorMessage('');
    focusDetailedScanInput();

    if (nextUpc && nextImeiOrSerial) {
      scanPackMutation.mutate({ upc: nextUpc, imeiOrSerial: nextImeiOrSerial });
    }
  };

  useEffect(() => {
    setAvailablePage(1);
    setLocallyPackedInventoryIds(new Set());
    setSelectedAvailableItemIds(new Set());
    setSelectedAvailableItemsById(new Map());
  }, [customerId, warehouseId]);

  useEffect(() => {
    setAvailablePage(1);
  }, [activeConditionFilter, activeDeviceFilter, activeInventorySearch]);

  useEffect(() => {
    setSelectedAvailableItemsById((current) => {
      const next = new Map(current);
      for (const item of availableItems) {
        if (selectedAvailableItemIds.has(item.id)) {
          next.set(item.id, item);
        }
      }
      return next;
    });
  }, [availableItems, selectedAvailableItemIds]);

  useEffect(() => {
    setBoxItemsPage(1);
    setSelectedBoxItemIds(new Set());
  }, [boxSearch, currentBox?.id, currentBox?.items.length]);

  useEffect(() => {
    if (!currentBox) return;
    setSizeLabel(currentBox.sizeLabel);
    setBoxNameDraft(getBoxDisplayName(currentBox));
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

  useEffect(() => {
    setScanValue('');
    setScanUpc('');
    setScanImeiOrSerial('');
    setScanBlockReason('');
    setBatchPackingOpen(false);
    setBatchItems([]);
  }, [customerId, warehouseId, currentBox?.id]);

  useEffect(() => {
    const nextCount = Math.max(1, Number(batchBoxCount) || 1);
    setBatchAllocationCounts((current) =>
      Array.from({ length: nextCount }, (_, index) => current[index] ?? ''),
    );
  }, [batchBoxCount]);

  useEffect(() => {
    if (batchPackingOpen) {
      void refreshBatchItems();
    }
  }, [batchPackingOpen]);

  const createBoxMutation = useMutation({
    mutationFn: () => {
      if (!warehouseId) {
        throw new Error('请先选择仓库。');
      }
      return outboundApi.createBox({
        customerId,
        warehouseId,
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
      const nextBoxName = boxNameDraft.trim();
      if (!nextBoxName) {
        throw new Error('请输入箱子名称');
      }
      return outboundApi.updateBox(currentBox.id, {
        boxName: nextBoxName,
        ...toBackendBoxSize(sizeLabel, manualSize),
        weightLb: toWeightNumber(weight),
        notes: note.trim() || undefined,
      });
    },
    onSuccess: (data) => {
      updateBoxEverywhere(data as OutboundBox);
      setMessage('已保存箱子设置');
      setErrorMessage('');
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '保存失败')),
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

  const scanPackMutation = useMutation({
    mutationFn: async (payload: { upc: string; imeiOrSerial: string }) => {
      if (!currentBox || !canMutateCurrentBox) {
        throw new Error('请先选择一个未封箱箱子。');
      }
      const searchedItems = await fetchAvailablePackingItems({ search: payload.imeiOrSerial });
      const candidates = mergePackingItems(availableItems, searchedItems);
      const exactMatch = candidates.find(
        (item) =>
          normalizeScanText(item.upc) === normalizeScanText(payload.upc) &&
          normalizeScanText(item.imeiOrSerial) === normalizeScanText(payload.imeiOrSerial),
      );
      if (!exactMatch) {
        const sameImei = candidates.find(
          (item) =>
            normalizeScanText(item.imeiOrSerial) === normalizeScanText(payload.imeiOrSerial),
        );
        if (sameImei) {
          throw new Error(
            `UPC 不匹配：该 IMEI / Serial 对应库存 UPC 为 ${sameImei.upc ?? '-'}，请修复后继续。`,
          );
        }
        throw new Error('没有找到同时匹配 UPC 和 IMEI / Serial 的当前客户在库货物。');
      }
      if (currentBox.items.some((item) => item.id === exactMatch.id)) {
        throw new Error('该货物已经在当前箱子中。');
      }
      const box = (await outboundApi.addItem(currentBox.id, {
        inventoryItemId: exactMatch.id,
      })) as OutboundBox;
      return { box, item: exactMatch };
    },
    onSuccess: ({ box, item }) => {
      const updatedBox = updateBoxEverywhere(box);
      const latestItem = updatedBox.items.find((boxItem) => boxItem.id === item.id);
      setLocallyPackedInventoryIds((current) => new Set(current).add(item.id));
      setHighlightedItemId(latestItem?.id ?? item.id);
      setScanUpc('');
      setScanImeiOrSerial('');
      setScanBlockReason('');
      setMessage(`已扫码装箱：${item.imeiOrSerial ?? item.upc ?? item.trackingNumber}`);
      setErrorMessage('');
      focusDetailedScanInput();
    },
    onError: (error) => {
      const messageText = toUserErrorMessage(error, '扫码装箱失败');
      setScanBlockReason(messageText);
      setErrorMessage(messageText);
    },
  });

  const batchPackingMutation = useMutation({
    mutationFn: async () => {
      if (!customerId || !warehouseId) {
        throw new Error('请先选择客户和仓库。');
      }
      const counts = normalizeBatchCounts(batchAllocationCounts);
      if (counts.length === 0) {
        throw new Error('请先填写每箱数量。');
      }
      const selectedBatchItems = getSelectedAvailableItems(
        selectedAvailableItemIds,
        selectedAvailableItemsById,
        batchItems,
      );
      const sourceItems =
        selectedBatchItems.length > 0
          ? selectedBatchItems
          : batchItems.length
            ? batchItems
            : await fetchAvailablePackingItems({
                condition: activeConditionFilter,
                device: activeDeviceFilter,
              });
      const totalCount = counts.reduce((sum, count) => sum + count, 0);
      if (sourceItems.length === 0) {
        throw new Error('当前客户没有可装箱库存。');
      }
      if (totalCount !== sourceItems.length) {
        throw new Error(`每箱数量合计必须等于当前可装箱总数 ${sourceItems.length}。`);
      }

      const groups = buildBatchGroups(sourceItems, counts);
      const packedInventoryIds: string[] = [];
      let latestBox: OutboundBox | null = null;
      for (const group of groups) {
        const createdBox = (await outboundApi.createBox({
          customerId,
          warehouseId,
          ...toBackendBoxSize(sizeLabel, manualSize),
          weightLb: toWeightNumber(weight),
          notes: note.trim() || undefined,
        })) as OutboundBox;
        latestBox = createdBox;
        for (const item of group) {
          latestBox = (await outboundApi.addItem(createdBox.id, {
            inventoryItemId: item.id,
          })) as OutboundBox;
          packedInventoryIds.push(item.id);
        }
      }
      return { latestBox, packedInventoryIds, boxCount: groups.length };
    },
    onSuccess: ({ latestBox, packedInventoryIds, boxCount }) => {
      if (latestBox) {
        const nextBox = updateBoxEverywhere(latestBox);
        setCurrentBox(nextBox);
        setDetailBox(nextBox);
      }
      setLocallyPackedInventoryIds((current) => {
        const next = new Set(current);
        for (const itemId of packedInventoryIds) {
          next.add(itemId);
        }
        return next;
      });
      setBatchPackingOpen(false);
      setSelectedAvailableItemIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['outbound-available-items'] });
      queryClient.invalidateQueries({ queryKey: ['outbound-boxes'] });
      setMessage(`已批量装箱：创建 ${boxCount} 个箱子，共 ${packedInventoryIds.length} 件货物`);
      setErrorMessage('');
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '批量装箱失败')),
  });

  useEffect(() => {
    if (scanAutoSubmitTimerRef.current) {
      window.clearTimeout(scanAutoSubmitTimerRef.current);
      scanAutoSubmitTimerRef.current = null;
    }
    if (
      packingMode !== 'DETAILED_SCAN' ||
      scanBlockReason ||
      scanPackMutation.isPending ||
      !currentBox ||
      !canMutateCurrentBox ||
      !isCompleteOutboundScanValue(scanValue)
    ) {
      return;
    }

    scanAutoSubmitTimerRef.current = window.setTimeout(() => {
      scanAutoSubmitTimerRef.current = null;
      applyScannedValue(scanValue);
    }, 160);

    return () => {
      if (scanAutoSubmitTimerRef.current) {
        window.clearTimeout(scanAutoSubmitTimerRef.current);
        scanAutoSubmitTimerRef.current = null;
      }
    };
  }, [
    canMutateCurrentBox,
    currentBox,
    packingMode,
    scanBlockReason,
    scanPackMutation.isPending,
    scanValue,
  ]);

  useEffect(() => {
    if (
      packingMode !== 'DETAILED_SCAN' ||
      !currentBox ||
      !canMutateCurrentBox ||
      scanBlockReason ||
      scanPackMutation.isPending
    ) {
      return;
    }
    focusDetailedScanInput();
  }, [
    canMutateCurrentBox,
    currentBox?.id,
    focusDetailedScanInput,
    packingMode,
    scanBlockReason,
    scanPackMutation.isPending,
  ]);

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
  const batchModalItems =
    selectedAvailableItemIds.size > 0
      ? getSelectedAvailableItems(selectedAvailableItemIds, selectedAvailableItemsById, batchItems)
      : batchItems;
  const requestSealBox = (box: PackingBox | null) => {
    if (!box) {
      setErrorMessage('请先选择或新建箱子');
      return;
    }
    if (box.photos.length === 0) {
      setErrorMessage('封箱前请先上传箱内照片');
      return;
    }
    setCurrentBox(box);
    sealMutation.mutate(box.id);
  };

  const uploadPhotoMutation = useMutation({
    mutationFn: async ({ box, file }: { box: PackingBox; file: File }) => {
      setUploadingPhotoBoxId(box.id);
      return outboundApi.uploadPhoto(box.id, file);
    },
    onSuccess: (data) => {
      updateBoxEverywhere(data as OutboundBox);
      setMessage('箱子照片已上传');
      setErrorMessage('');
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '上传照片失败')),
    onSettled: () => setUploadingPhotoBoxId(null),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async ({ box, photoId }: { box: PackingBox; photoId: string }) => {
      setUploadingPhotoBoxId(box.id);
      return outboundApi.deletePhoto(box.id, photoId);
    },
    onSuccess: (data) => {
      const result = data as { box: OutboundBox };
      updateBoxEverywhere(result.box);
      setMessage('箱子照片已删除');
      setErrorMessage('');
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '删除照片失败')),
    onSettled: () => setUploadingPhotoBoxId(null),
  });

  const saveShippingTrackingNoMutation = useMutation({
    mutationFn: async ({
      box,
      shippingTrackingNo,
    }: {
      box: PackingBox;
      shippingTrackingNo: string;
    }) => outboundApi.updateBox(box.id, { shippingTrackingNo }),
    onSuccess: (data) => {
      updateBoxEverywhere(data as OutboundBox);
      setMessage('箱子单号已保存');
      setErrorMessage('');
    },
    onError: (error) => setErrorMessage(toUserErrorMessage(error, '保存单号失败')),
  });

  const deleteBoxesMutation = useMutation({
    mutationFn: async (boxesToDelete: PackingBox[]) => {
      if (boxesToDelete.length === 0) {
        throw new Error('请先选择要删除的箱子');
      }
      const sealedBoxes = boxesToDelete.filter((box) => box.status === 'sealed');
      if (sealedBoxes.length) {
        throw new Error(`已选中 ${sealedBoxes.length} 个已封箱箱子，请先返工后再删除。`);
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
      queryClient.invalidateQueries({
        queryKey: ['outbound-available-items'],
        refetchType: 'none',
      });
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
      queryClient.invalidateQueries({
        queryKey: ['inventory-customer-summary'],
        refetchType: 'none',
      });
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
        warehouses={warehouses}
        warehouseId={warehouseId}
        onCustomerChange={(nextCustomerId) => {
          setCustomerId(nextCustomerId);
          setCurrentBox(null);
          setDetailBox(null);
          setAvailablePage(1);
          setBoxesPage(1);
        }}
        onWarehouseChange={(nextWarehouseId) => {
          setWarehouseId(nextWarehouseId);
          setCurrentBox(null);
          setDetailBox(null);
          setAvailablePage(1);
          setBoxesPage(1);
        }}
      />

      <BoxQuickEditor
        boxName={currentBox ? boxNameDraft : ''}
        sizeLabel={sizeLabel}
        manualSize={manualSize}
        manualSizeOpen={manualSizeOpen}
        weight={weight}
        note={note}
        currentBox={currentBox}
        isSaving={updateBoxMutation.isPending}
        isSealing={sealMutation.isPending}
        isCreating={createBoxMutation.isPending}
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
        onBoxNameChange={setBoxNameDraft}
        onManualSizeOpenChange={setManualSizeOpen}
        onManualSizeChange={setManualSize}
        onWeightChange={setWeight}
        onNoteChange={setNote}
        onSave={() => updateBoxMutation.mutate()}
        onSeal={() => requestSealBox(currentBox)}
        onCreate={() => createBoxMutation.mutate()}
      />

      <PackingModeSwitch mode={packingMode} onModeChange={setPackingMode} />

      {message ? <div className="inline-success">{message}</div> : null}
      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}

      <div className="outbound-workbench-grid">
        <InventoryPackingTable
          items={availableItems}
          total={availableTotal}
          page={availablePage}
          pageSize={availablePageSize}
          search={inventorySearch}
          isSearchMode={Boolean(activeInventorySearch)}
          showProductFilters={isBulkPackingMode}
          conditionFilter={conditionFilter}
          deviceFilter={deviceFilter}
          canAdd={Boolean(currentBox && canMutateCurrentBox)}
          isAdding={
            addItemMutation.isPending ||
            batchAddItemsMutation.isPending ||
            batchPackingMutation.isPending
          }
          canBulkPackAll={Boolean(
            customerId &&
              warehouseId &&
              (selectedAvailableItemIds.size > 0 || (!activeInventorySearch && availableTotal > 0)),
          )}
          selectedItemIds={selectedAvailableItemIds}
          selectedTotal={selectedAvailableItemIds.size}
          onSearchChange={(value) => {
            setInventorySearch(value);
            setAvailablePage(1);
          }}
          onConditionFilterChange={setConditionFilter}
          onDeviceFilterChange={setDeviceFilter}
          onSelectionChange={(nextIds) => {
            setSelectedAvailableItemIds(nextIds);
            setSelectedAvailableItemsById((current) => {
              const next = new Map(current);
              for (const item of availableItems) {
                if (nextIds.has(item.id)) {
                  next.set(item.id, item);
                } else {
                  next.delete(item.id);
                }
              }
              for (const id of Array.from(next.keys())) {
                if (!nextIds.has(id)) {
                  next.delete(id);
                }
              }
              return next;
            });
          }}
          onClearSelection={() => {
            setSelectedAvailableItemIds(new Set());
            setSelectedAvailableItemsById(new Map());
          }}
          onPageChange={setAvailablePage}
          onPageSizeChange={(nextPageSize) => {
            setAvailablePageSize(nextPageSize);
            setAvailablePage(1);
          }}
          onAdd={(item) => addItemMutation.mutate(item.id)}
          onBatchAdd={(items) => batchAddItemsMutation.mutate(items.map((item) => item.id))}
          onOpenBulkPacking={() => {
            setPackingMode('BULK_BOX');
            setBatchPackingOpen(true);
          }}
        />
        <CurrentBoxWorkspace
          box={currentBox}
          packingMode={packingMode}
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
          scanValue={scanValue}
          scanUpc={scanUpc}
          scanImeiOrSerial={scanImeiOrSerial}
          scanBlockReason={scanBlockReason}
          isScanPacking={scanPackMutation.isPending}
          scanInputRef={scanInputRef}
          onSearchChange={setBoxSearch}
          onScanValueChange={setScanValue}
          onScanSubmit={() => applyScannedValue(scanValue)}
          onScanClear={resetDetailedScan}
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
        currentBoxId={currentBox?.id ?? null}
        total={boxes?.total ?? 0}
        page={boxesPage}
        pageSize={boxesPageSize}
        bouncingBoxId={bouncingBoxId}
        isRefreshing={boxesQuery.isFetching}
        isSealing={sealMutation.isPending}
        isReopening={reopenMutation.isPending}
        isDeleting={deleteBoxesMutation.isPending}
        uploadingPhotoBoxId={uploadingPhotoBoxId}
        selectedBoxIds={selectedCreatedBoxIds}
        onRefresh={() => boxesQuery.refetch()}
        onPageChange={setBoxesPage}
        onSelectionChange={setSelectedCreatedBoxIds}
        onRequestDelete={() => setDeleteBoxesConfirmOpen(true)}
        onOpenDetail={openBoxDetail}
        onSetCurrent={(box) => {
          void loadFullBox(box)
            .then((loadedBox) => {
              setCurrentBox(loadedBox);
              setMessage(`当前装箱目标已切换为 ${getBoxDisplayName(loadedBox)}`);
              setErrorMessage('');
            })
            .catch((error) => setErrorMessage(toUserErrorMessage(error, '切换当前箱失败')));
        }}
        onEdit={(box) => {
          void loadFullBox(box)
            .then(setCurrentBox)
            .catch((error) => setErrorMessage(toUserErrorMessage(error, '读取箱子失败')));
        }}
        onSeal={requestSealBox}
        onReopen={(box) => reopenMutation.mutate(box.id)}
        onUploadPhoto={(box, file) => uploadPhotoMutation.mutate({ box, file })}
        onDeletePhoto={(box, photoId) => deletePhotoMutation.mutate({ box, photoId })}
        onSaveShippingTrackingNo={(box, shippingTrackingNo) =>
          saveShippingTrackingNoMutation.mutate({ box, shippingTrackingNo })
        }
      />

      <DeleteBoxesConfirmModal
        boxes={selectedCreatedBoxes}
        open={deleteBoxesConfirmOpen}
        isDeleting={deleteBoxesMutation.isPending}
        onClose={() => setDeleteBoxesConfirmOpen(false)}
        onConfirm={() => deleteBoxesMutation.mutate(selectedCreatedBoxes)}
      />

      <BatchPackingModal
        open={batchPackingOpen}
        items={batchModalItems}
        boxCount={batchBoxCount}
        allocationCounts={batchAllocationCounts}
        selectedCount={selectedAvailableItemIds.size}
        filterLabel={getProductFilterLabel(activeConditionFilter, activeDeviceFilter)}
        isLoadingItems={isBatchItemsLoading}
        isSubmitting={batchPackingMutation.isPending}
        onClose={() => setBatchPackingOpen(false)}
        onRefreshItems={refreshBatchItems}
        onBoxCountChange={setBatchBoxCount}
        onAllocationCountChange={(index, value) =>
          setBatchAllocationCounts((current) =>
            current.map((item, itemIndex) => (itemIndex === index ? value : item)),
          )
        }
        onSubmit={() => batchPackingMutation.mutate()}
      />

      <BoxDetailModal
        box={detailBox}
        availableItems={availableItems}
        canMutate={detailBox?.id === currentBox?.id && canMutateCurrentBox}
        isRemoving={removeItemMutation.isPending}
        onClose={() => setDetailBox(null)}
        onRemove={(item) => removeItemMutation.mutate(item)}
        onOpenPrint={(box) => setPrintDetailBox(box)}
      />

      <PrintDetailModal
        box={printDetailBox}
        onClose={() => setPrintDetailBox(null)}
        onConfirmPrint={() => window.print()}
      />
    </section>
  );
}

function TrackingSearchBar(props: {
  customers: CustomerOption[];
  customerId: string;
  warehouses: Array<{ id: string; code: string; name: string }>;
  warehouseId: string;
  onCustomerChange: (customerId: string) => void;
  onWarehouseChange: (warehouseId: string) => void;
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
      <label className="outbound-control outbound-customer-select">
        <span>仓库</span>
        <select
          value={props.warehouseId}
          onChange={(event) => props.onWarehouseChange(event.target.value)}
        >
          {props.warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.code} - {warehouse.name}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function PackingModeSwitch(props: {
  mode: OutboundPackingMode;
  onModeChange: (mode: OutboundPackingMode) => void;
}) {
  return (
    <section className="outbound-mode-switch" role="group" aria-label="装箱模式">
      <button
        type="button"
        className={props.mode === 'DETAILED_SCAN' ? 'active' : ''}
        onClick={() => props.onModeChange('DETAILED_SCAN')}
      >
        <ScanLine size={16} />
        <strong>细致装箱</strong>
        <span>随机扫码 UPC 和 IMEI，匹配后自动加入当前箱</span>
      </button>
      <button
        type="button"
        className={props.mode === 'BULK_BOX' ? 'active' : ''}
        onClick={() => props.onModeChange('BULK_BOX')}
      >
        <ClipboardList size={16} />
        <strong>批量装箱</strong>
        <span>筛选并勾选库存后，按每箱数量生成明细</span>
      </button>
    </section>
  );
}

function BoxQuickEditor(props: {
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
        <label className="outbound-control wide">
          <span>箱子名称</span>
          <input
            value={props.boxName}
            onChange={(event) => props.onBoxNameChange(event.target.value)}
            placeholder="创建后由系统自动生成"
            disabled={!props.currentBox || !canEdit}
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
            保存
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
  isSearchMode: boolean;
  showProductFilters: boolean;
  conditionFilter: ProductConditionFilter;
  deviceFilter: ProductDeviceFilter;
  canAdd: boolean;
  canBulkPackAll: boolean;
  isAdding: boolean;
  selectedItemIds: Set<string>;
  selectedTotal: number;
  onSearchChange: (value: string) => void;
  onConditionFilterChange: (value: ProductConditionFilter) => void;
  onDeviceFilterChange: (value: ProductDeviceFilter) => void;
  onSelectionChange: (value: Set<string>) => void;
  onClearSelection: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onAdd: (item: PackingItem) => void;
  onBatchAdd: (items: PackingItem[]) => void;
  onOpenBulkPacking: () => void;
}) {
  const selectableItems = props.items.filter(isPackingItemSelectable);
  const selectedItems = selectableItems.filter((item) => props.selectedItemIds.has(item.id));
  const allVisibleSelected =
    selectableItems.length > 0 &&
    selectableItems.every((item) => props.selectedItemIds.has(item.id));
  const toggleVisibleSelection = (checked: boolean) => {
    props.onSelectionChange(
      checked
        ? new Set([...Array.from(props.selectedItemIds), ...selectableItems.map((item) => item.id)])
        : new Set(
            Array.from(props.selectedItemIds).filter(
              (id) => !selectableItems.some((item) => item.id === id),
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
            {props.isSearchMode ? '搜索结果包含待装箱和已装箱货物' : '当前客户可装箱货物'}
            {props.selectedTotal ? ` · 已记忆勾选 ${props.selectedTotal} 件` : ''}
          </span>
        </div>
        <div className="outbound-filter-row">
          {props.showProductFilters ? (
            <>
              <label className="outbound-mini-select">
                <span>成色</span>
                <select
                  value={props.conditionFilter}
                  onChange={(event) =>
                    props.onConditionFilterChange(event.target.value as ProductConditionFilter)
                  }
                >
                  <option value="ALL">全部</option>
                  <option value="NEW">全新</option>
                  <option value="REFURBISHED">翻新</option>
                </select>
              </label>
              <label className="outbound-mini-select">
                <span>品类</span>
                <select
                  value={props.deviceFilter}
                  onChange={(event) =>
                    props.onDeviceFilterChange(event.target.value as ProductDeviceFilter)
                  }
                >
                  <option value="ALL">全部品类</option>
                  <option value="IPHONE">iPhone</option>
                  <option value="IPAD">iPad</option>
                </select>
              </label>
            </>
          ) : null}
          <label className="outbound-mini-search">
            <Search size={15} />
            <input
              value={props.search}
              onChange={(event) => props.onSearchChange(event.target.value)}
              placeholder="搜索单号、IMEI/Serial 或货物信息"
            />
          </label>
        </div>
      </div>
      <div className="outbound-box-footer compact">
        <button
          type="button"
          className="outbound-btn outbound-btn-outline"
          disabled={!props.canBulkPackAll || props.isAdding}
          onClick={props.onOpenBulkPacking}
        >
          <Shuffle size={16} />
          分箱装箱 {props.selectedTotal ? `${props.selectedTotal} 件已选` : `${props.total} 件`}
        </button>
        <button
          type="button"
          className="outbound-btn outbound-btn-primary"
          disabled={!props.canAdd || selectedItems.length === 0 || props.isAdding}
          onClick={() => props.onBatchAdd(selectedItems)}
        >
          <PackagePlus size={16} />
          批量装箱 {selectedItems.length ? `${selectedItems.length} 件` : ''}
        </button>
        <button
          type="button"
          className="outbound-btn outbound-btn-outline"
          disabled={props.selectedTotal === 0 || props.isAdding}
          onClick={props.onClearSelection}
        >
          <X size={16} />
          取消勾选 {props.selectedTotal ? `${props.selectedTotal} 件` : ''}
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
                  disabled={selectableItems.length === 0}
                  onChange={(event) => toggleVisibleSelection(event.target.checked)}
                />
              </th>
              <th>入库时间</th>
              <th>物流单号</th>
              <th>货物信息</th>
              <th>IMEI / Serial</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item) => {
              const selectable = isPackingItemSelectable(item);
              const boxLabel = getLatestOutboundBoxLabel(item);
              return (
                <tr key={item.id} className={selectable ? undefined : 'row-muted'}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`选择 ${item.imeiOrSerial ?? item.trackingNumber}`}
                      checked={selectable && props.selectedItemIds.has(item.id)}
                      disabled={!selectable}
                      onChange={(event) => toggleItemSelection(item.id, event.target.checked)}
                    />
                  </td>
                  <td>{formatShortDateTime(item.receivedAt)}</td>
                  <td>
                    <strong className="mono">{item.trackingNumber || '-'}</strong>
                    <span>{item.carrier}</span>
                  </td>
                  <td>
                    <strong>{item.productName ?? '-'}</strong>
                    <span>UPC {item.upc ?? '-'}</span>
                    {item.productModelCode ? <span>型号代码 {item.productModelCode}</span> : null}
                    <span>{getProductClassLabel(item)}</span>
                  </td>
                  <td className="mono">{item.imeiOrSerial ?? '-'}</td>
                  <td>
                    <ItemStatusBadge status={item.status} />
                    {boxLabel ? (
                      <span className="outbound-status-note">所在箱：{boxLabel}</span>
                    ) : null}
                    {item.latestOutboundBox?.sealedAt ? (
                      <span className="outbound-status-note">箱状态：已封箱</span>
                    ) : null}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="outbound-table-btn"
                      disabled={!props.canAdd || props.isAdding || !selectable}
                      onClick={() => props.onAdd(item)}
                    >
                      <PackagePlus size={15} />
                      {selectable ? '加入箱子' : item.status === 'packed' ? '已在箱中' : '不可装箱'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {props.items.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  {props.isSearchMode ? '没有匹配的客户库存货物' : '没有匹配的可装箱货物'}
                </td>
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
  packingMode: OutboundPackingMode;
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
  scanValue: string;
  scanUpc: string;
  scanImeiOrSerial: string;
  scanBlockReason: string;
  isScanPacking: boolean;
  scanInputRef: RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onScanValueChange: (value: string) => void;
  onScanSubmit: () => void;
  onScanClear: () => void;
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
          <span>{props.box ? getBoxDisplayName(props.box) : '尚未选择箱子'}</span>
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
      {props.packingMode === 'DETAILED_SCAN' ? (
        <DetailedScanPackingPanel
          box={props.box}
          canMutate={props.canMutate}
          scanValue={props.scanValue}
          scanUpc={props.scanUpc}
          scanImeiOrSerial={props.scanImeiOrSerial}
          blockReason={props.scanBlockReason}
          isPacking={props.isScanPacking}
          scanInputRef={props.scanInputRef}
          onScanValueChange={props.onScanValueChange}
          onScanSubmit={props.onScanSubmit}
          onClear={props.onScanClear}
        />
      ) : null}
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
                  {item.productModelCode ? <span>型号代码 {item.productModelCode}</span> : null}
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

function DetailedScanPackingPanel(props: {
  box: PackingBox | null;
  canMutate: boolean;
  scanValue: string;
  scanUpc: string;
  scanImeiOrSerial: string;
  blockReason: string;
  isPacking: boolean;
  scanInputRef: RefObject<HTMLInputElement | null>;
  onScanValueChange: (value: string) => void;
  onScanSubmit: () => void;
  onClear: () => void;
}) {
  const disabled = !props.box || !props.canMutate || !!props.blockReason || props.isPacking;
  return (
    <div className={`outbound-scan-pack-panel ${props.blockReason ? 'blocked' : ''}`}>
      <div className="outbound-scan-pack-head">
        <div>
          <strong>细致扫码装箱</strong>
          <span>
            当前装箱目标：
            {props.box ? getBoxDisplayName(props.box) : '未选择箱子'}。扫完自动录入，异常时暂停
          </span>
        </div>
        <button type="button" className="outbound-btn outbound-btn-outline" onClick={props.onClear}>
          <RefreshCw size={15} />
          清空扫码
        </button>
      </div>
      <div className="outbound-scan-pack-grid">
        <label className="outbound-control outbound-scan-pack-input">
          <span>自动扫码口</span>
          <input
            ref={props.scanInputRef}
            value={props.scanValue}
            disabled={disabled}
            autoComplete="off"
            autoFocus
            placeholder={props.box ? '直接扫描 UPC 或 IMEI / Serial' : '请先选择或新建箱子'}
            onChange={(event) => props.onScanValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                props.onScanSubmit();
              }
            }}
          />
        </label>
        <div className="outbound-scan-token">
          <span>UPC</span>
          <strong>{props.scanUpc || '等待扫描'}</strong>
        </div>
        <div className="outbound-scan-token">
          <span>IMEI / Serial</span>
          <strong>{props.scanImeiOrSerial || '等待扫描'}</strong>
        </div>
        <button
          type="button"
          className="outbound-btn outbound-btn-primary"
          disabled={disabled || !props.scanValue.trim()}
          onClick={props.onScanSubmit}
        >
          <ScanLine size={16} />
          自动录入
        </button>
      </div>
      {props.blockReason ? (
        <div className="outbound-scan-block">
          <ShieldCheck size={16} />
          <span>{props.blockReason}</span>
        </div>
      ) : null}
    </div>
  );
}

function CreatedBoxList(props: {
  boxes: PackingBox[];
  currentBoxId: string | null;
  total: number;
  page: number;
  pageSize: number;
  bouncingBoxId: string | null;
  uploadingPhotoBoxId: string | null;
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
  onSetCurrent: (box: PackingBox) => void;
  onEdit: (box: PackingBox) => void;
  onSeal: (box: PackingBox) => void;
  onReopen: (box: PackingBox) => void;
  onUploadPhoto: (box: PackingBox, file: File) => void;
  onDeletePhoto: (box: PackingBox, photoId: string) => void;
  onSaveShippingTrackingNo: (box: PackingBox, shippingTrackingNo: string) => void;
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
            勾选只用于删除，扫码只会进入当前装箱目标
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
            {selectedCount ? '删除选中' : '先选箱子'}
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
            isCurrent={props.currentBoxId === box.id}
            isSelected={props.selectedBoxIds.has(box.id)}
            isBouncing={props.bouncingBoxId === box.id}
            isSealing={props.isSealing}
            isReopening={props.isReopening}
            isUploadingPhoto={props.uploadingPhotoBoxId === box.id}
            onToggleSelected={() => toggleBoxSelection(box.id)}
            onOpenDetail={() => props.onOpenDetail(box)}
            onSetCurrent={() => props.onSetCurrent(box)}
            onEdit={() => props.onEdit(box)}
            onSeal={() => props.onSeal(box)}
            onReopen={() => props.onReopen(box)}
            onUploadPhoto={(file) => props.onUploadPhoto(box, file)}
            onDeletePhoto={(photoId) => props.onDeletePhoto(box, photoId)}
            onSaveShippingTrackingNo={(shippingTrackingNo) =>
              props.onSaveShippingTrackingNo(box, shippingTrackingNo)
            }
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
  isCurrent: boolean;
  isSelected: boolean;
  isBouncing: boolean;
  isSealing: boolean;
  isReopening: boolean;
  isUploadingPhoto: boolean;
  onToggleSelected: () => void;
  onOpenDetail: () => void;
  onSetCurrent: () => void;
  onEdit: () => void;
  onSeal: () => void;
  onReopen: () => void;
  onUploadPhoto: (file: File) => void;
  onDeletePhoto: (photoId: string) => void;
  onSaveShippingTrackingNo: (shippingTrackingNo: string) => void;
}) {
  const imeiCount = props.box.items.filter((item) => item.imeiOrSerial).length;
  const canChangePhotos = props.box.status !== 'sealed';
  const [trackingEditorOpen, setTrackingEditorOpen] = useState(false);
  const [shippingTrackingDraft, setShippingTrackingDraft] = useState(
    props.box.shippingTrackingNo ?? '',
  );
  const firstPhoto = props.box.photos[0];
  useEffect(() => {
    setShippingTrackingDraft(props.box.shippingTrackingNo ?? '');
  }, [props.box.shippingTrackingNo]);
  return (
    <article
      className={[
        'created-box-card',
        props.isSelected ? 'selected' : '',
        props.isCurrent ? 'current-target' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={props.onToggleSelected}
    >
      <div className="created-box-select-indicator">
        <input
          type="checkbox"
          aria-label={`选择 ${getBoxDisplayName(props.box)}`}
          checked={props.isSelected}
          onChange={props.onToggleSelected}
          onClick={(event) => event.stopPropagation()}
        />
        <span>{props.isCurrent ? '当前装箱' : props.isSelected ? '已选中' : '勾选删除'}</span>
      </div>
      <button
        type="button"
        className={`created-box-icon ${props.isBouncing ? 'open' : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          props.onOpenDetail();
        }}
        aria-label={`查看 ${getBoxDisplayName(props.box)} 明细`}
      >
        <Archive size={24} />
      </button>
      <div className="created-box-card-head">
        <strong>{getBoxDisplayName(props.box)}</strong>
        <StatusBadge status={props.box.status} />
      </div>
      {props.isCurrent ? (
        <div className="created-box-current-target">扫码录入会进入这个箱子</div>
      ) : null}
      <div className="created-box-meta">
        <span>尺寸：{props.box.sizeLabel}</span>
        <span>
          重量：{props.box.weight} {props.box.weightUnit}
        </span>
      </div>
      <div className="created-box-copy">
        <span>备注：{props.box.note || '-'}</span>
      </div>
      <div className="created-box-stats">
        <span>货物数量：{props.box.itemCount}</span>
        <span>IMEI / Serial：{imeiCount}</span>
      </div>
      <div
        className={`created-box-photo ${firstPhoto ? 'has-photo' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        {firstPhoto ? (
          <EvidencePreview
            evidence={firstPhoto}
            label={`${getBoxDisplayName(props.box)} 装箱凭证`}
          />
        ) : (
          <div className="created-box-photo-empty">
            <Camera size={18} />
            <span>封箱前需上传照片或视频</span>
          </div>
        )}
        <div className="created-box-photo-footer">
          <span>{props.box.photos.length ? `${props.box.photos.length} 个凭证` : '暂无凭证'}</span>
          {canChangePhotos ? (
            <div className="created-box-photo-actions">
              <label
                className={`created-box-photo-action primary ${props.isUploadingPhoto ? 'disabled' : ''}`}
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="file"
                  accept="image/*,video/mp4,video/quicktime,video/webm"
                  disabled={props.isUploadingPhoto}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file) {
                      props.onUploadPhoto(file);
                    }
                  }}
                />
                <ImagePlus size={14} />
                {props.isUploadingPhoto ? '上传中' : '相册/视频'}
              </label>
              <label
                className={`created-box-photo-action primary ${props.isUploadingPhoto ? 'disabled' : ''}`}
                onClick={(event) => event.stopPropagation()}
              >
                <input
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  disabled={props.isUploadingPhoto}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file) {
                      props.onUploadPhoto(file);
                    }
                  }}
                />
                <Camera size={14} />
                拍照/录像
              </label>
              {firstPhoto ? (
                <button
                  type="button"
                  className="created-box-photo-action danger"
                  disabled={props.isUploadingPhoto}
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onDeletePhoto(firstPhoto.id);
                  }}
                >
                  删除
                </button>
              ) : null}
              <button
                type="button"
                className="created-box-photo-action secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  setTrackingEditorOpen(true);
                }}
              >
                <Send size={14} />
                {props.box.shippingTrackingNo ? '改单号' : '上传单号'}
              </button>
            </div>
          ) : null}
        </div>
        {trackingEditorOpen ? (
          <div className="created-box-tracking-editor">
            <input
              value={shippingTrackingDraft}
              placeholder="输入单号"
              maxLength={80}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setShippingTrackingDraft(event.currentTarget.value)}
            />
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                props.onSaveShippingTrackingNo(shippingTrackingDraft);
                setTrackingEditorOpen(false);
              }}
            >
              保存
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setShippingTrackingDraft(props.box.shippingTrackingNo ?? '');
                setTrackingEditorOpen(false);
              }}
            >
              取消
            </button>
          </div>
        ) : (
          <span className="created-box-tracking-display">
            单号：{props.box.shippingTrackingNo || '-'}
          </span>
        )}
      </div>
      <div className="created-box-actions">
        <button
          type="button"
          className={props.isCurrent ? 'is-current' : ''}
          disabled={props.isCurrent || props.box.status === 'sealed'}
          onClick={(event) => {
            event.stopPropagation();
            props.onSetCurrent();
          }}
        >
          {props.isCurrent ? '当前箱' : '设为当前箱'}
        </button>
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
  const canConfirmDelete = props.boxes.length > 0 && sealedCount === 0;
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
                <strong>{getBoxDisplayName(box)}</strong>
                <span>{box.itemCount} 件货物</span>
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
            disabled={props.isDeleting || !canConfirmDelete}
            onClick={props.onConfirm}
          >
            <Trash2 size={16} />
            {sealedCount ? '请先返工' : '确认删除'}
          </button>
        </div>
      </section>
    </div>
  );
}

function BatchPackingModal(props: {
  open: boolean;
  items: PackingItem[];
  boxCount: string;
  allocationCounts: string[];
  selectedCount: number;
  filterLabel: string;
  isLoadingItems: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onRefreshItems: () => void;
  onBoxCountChange: (value: string) => void;
  onAllocationCountChange: (index: number, value: string) => void;
  onSubmit: () => void;
}) {
  if (!props.open) {
    return null;
  }
  const counts = normalizeBatchCounts(props.allocationCounts);
  const allocationTotal = props.allocationCounts.reduce(
    (sum, value) => sum + Math.max(0, Number(value) || 0),
    0,
  );
  const canSubmit =
    props.items.length > 0 &&
    counts.length === props.allocationCounts.length &&
    allocationTotal === props.items.length;
  const previewGroups = buildBatchGroups(props.items, props.allocationCounts.map((value) => Math.max(0, Number(value) || 0)));

  return (
    <div className="outbound-modal-backdrop" role="presentation" onClick={props.onClose}>
      <section
        className="outbound-detail-modal outbound-batch-modal"
        role="dialog"
        aria-modal="true"
        aria-label="批量装箱"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="outbound-modal-head">
          <div>
            <p>Bulk Packing</p>
            <h2>库存批量分箱</h2>
          </div>
          <button type="button" className="outbound-modal-close" onClick={props.onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="outbound-batch-summary">
          <SummaryTile
            label={props.selectedCount ? '已勾选货物' : '筛选后可装箱'}
            value={props.isLoadingItems ? '读取中' : props.items.length}
          />
          <SummaryTile label="分配合计" value={allocationTotal} />
          <SummaryTile label="分箱数量" value={props.allocationCounts.length} />
        </div>
        <div className="outbound-batch-controls">
          <label className="outbound-control compact">
            <span>需要几箱</span>
            <input
              type="number"
              min="1"
              max="20"
              value={props.boxCount}
              onChange={(event) => props.onBoxCountChange(event.target.value)}
            />
          </label>
          <div className="outbound-batch-random-note">
            <ClipboardList size={16} />
            <span>
              {props.selectedCount
                ? `使用已勾选货物，筛选：${props.filterLabel}`
                : `未勾选时使用当前筛选库存：${props.filterLabel}`}
            </span>
          </div>
          <button
            type="button"
            className="outbound-btn outbound-btn-outline"
            disabled={props.isLoadingItems}
            onClick={props.onRefreshItems}
          >
            <RefreshCw size={15} />
            刷新库存
          </button>
        </div>
        <div className="outbound-batch-count-grid">
          {props.allocationCounts.map((count, index) => (
            <label key={index} className="outbound-control compact">
              <span>箱 {index + 1}</span>
              <input
                type="number"
                min="0"
                value={count}
                onChange={(event) => props.onAllocationCountChange(index, event.target.value)}
              />
            </label>
          ))}
        </div>
        {allocationTotal !== props.items.length ? (
          <div className="outbound-confirm-warning">
            每箱数量合计必须等于当前可装箱总数 {props.items.length}。
          </div>
        ) : null}
        <div className="outbound-batch-preview">
          {previewGroups.map((group, index) => (
            <article key={index} className="outbound-batch-preview-box">
              <div className="outbound-batch-preview-head">
                <strong>箱 {index + 1}</strong>
                <span>{group.length} 件</span>
              </div>
              <div className="outbound-batch-preview-list">
                {group.slice(0, 8).map((item) => (
                  <div key={item.id}>
                    <span>{formatShortDateTime(item.receivedAt)}</span>
                    <strong>{item.productName ?? '-'}</strong>
                    <em className="mono">{item.imeiOrSerial ?? item.trackingNumber ?? '-'}</em>
                  </div>
                ))}
                {group.length > 8 ? <small>还有 {group.length - 8} 件未展开</small> : null}
                {group.length === 0 ? <small>填写数量后显示箱内明细</small> : null}
              </div>
            </article>
          ))}
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
            className="outbound-btn outbound-btn-primary"
            disabled={!canSubmit || props.isSubmitting || props.isLoadingItems}
            onClick={props.onSubmit}
          >
            <PackagePlus size={16} />
            确认批量装箱
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
  onOpenPrint: (box: PackingBox) => void;
}) {
  if (!props.box) {
    return null;
  }
  const box = props.box;
  const carrierCounts = box.items.reduce(
    (counts, item) => {
      counts[item.carrier] += 1;
      return counts;
    },
    { UPS: 0, FedEx: 0, USPS: 0 } as Record<Carrier, number>,
  );
  const imeiCount = box.items.filter((item) => item.imeiOrSerial).length;
  const upcSummaries = summarizeByUpc(box.items, props.availableItems);
  return (
    <div className="outbound-modal-backdrop" role="presentation" onClick={props.onClose}>
      <section
        className="outbound-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${getBoxDisplayName(box)} 明细`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="outbound-modal-head">
          <div>
            <p>Box Detail</p>
            <h2>{getBoxDisplayName(box)} 明细</h2>
          </div>
          <button
            type="button"
            className="outbound-btn outbound-btn-outline outbound-print-detail-trigger"
            onClick={() => props.onOpenPrint(box)}
          >
            <Printer size={16} />
            打印明细
          </button>
          <button type="button" className="outbound-modal-close" onClick={props.onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="outbound-detail-body">
          <div className="outbound-detail-summary">
            <span>箱子名称：{getBoxDisplayName(props.box)}</span>
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
          <div className="outbound-detail-section">
            <div className="outbound-product-summary-head">
              <h3>箱内货物明细</h3>
              <span>共 {props.box.items.length} 件</span>
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
                      <td>
                        <strong>{item.productName ?? '-'}</strong>
                        {item.productModelCode ? <span>型号代码 {item.productModelCode}</span> : null}
                      </td>
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
          <div className="outbound-detail-evidence">
            <div className="outbound-detail-evidence-head">
              <h3>装箱凭证</h3>
              <span>单号：{props.box.shippingTrackingNo || '-'}</span>
            </div>
            {props.box.photos.length ? (
              <div className="outbound-detail-photo-grid">
                {props.box.photos.map((photo) => (
                  <a
                    key={photo.id}
                    href={toApiAssetUrl(photo.fileUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="outbound-detail-photo"
                  >
                    <EvidencePreview evidence={photo} label={photo.originalName} />
                    <span>{photo.originalName}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="outbound-detail-photo-empty compact">
                <Camera size={18} />
                <span>暂无装箱凭证</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PrintDetailModal(props: {
  box: PackingBox | null;
  onClose: () => void;
  onConfirmPrint: () => void;
}) {
  if (!props.box) {
    return null;
  }
  const lines = buildPrintDetailLines(props.box);
  return (
    <div className="outbound-modal-backdrop compact" role="presentation" onClick={props.onClose}>
      <section
        className="outbound-confirm-modal outbound-print-modal"
        role="dialog"
        aria-modal="true"
        aria-label="打印明细"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="outbound-modal-head">
          <div>
            <p>Print Detail</p>
            <h2>打印明细</h2>
          </div>
          <button type="button" className="outbound-modal-close" onClick={props.onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="outbound-print-sheet">
          <pre>{lines.join('\n')}</pre>
        </div>
        <div className="outbound-confirm-actions">
          <button type="button" className="outbound-btn outbound-btn-outline" onClick={props.onClose}>
            取消
          </button>
          <button
            type="button"
            className="outbound-btn outbound-btn-primary"
            onClick={props.onConfirmPrint}
          >
            <Printer size={16} />
            确认打印
          </button>
        </div>
      </section>
    </div>
  );
}

function EvidencePreview(props: { evidence: OutboundBoxPhoto; label: string }) {
  const url = toApiAssetUrl(props.evidence.fileUrl);
  if (props.evidence.mimeType.startsWith('video/')) {
    return (
      <video controls playsInline preload="metadata" aria-label={props.label}>
        <source src={url} type={props.evidence.mimeType} />
      </video>
    );
  }
  return <img src={url} alt={props.label} />;
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
    outbound: '已出库',
    exception: '异常',
    voided: '已作废',
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
type InventoryResult = {
  items: InventorySearchItem[];
  total: number;
  page: number;
  pageSize: number;
};
type BoxListResult = { items: OutboundBox[]; total: number; page: number; pageSize: number };
type LatestOutboundBox = {
  id: string;
  boxNo: string;
  boxName?: string | null;
  status?: string;
  sealedAt?: string | null;
};
type InventorySearchItem = {
  id: string;
  upc: string;
  upsTrackingNo: string | null;
  imei: string | null;
  serial: string | null;
  status: string;
  availableForOutbound?: boolean;
  latestOutboundBox?: LatestOutboundBox | null;
  customer?: { id: string; name: string };
  product: {
    id?: string;
    sku?: string;
    name: string;
    model?: string | null;
    modelCode?: string | null;
    category?: string | null;
  };
  receivedAt?: string | null;
};
type AvailableItem = InventorySearchItem;
type OutboundBox = {
  id: string;
  boxNo: string;
  boxName?: string | null;
  sizePreset?: string | null;
  customSize?: string | null;
  weightLb?: number | null;
  shippingTrackingNo?: string | null;
  status: string;
  itemCount: number;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  sealedAt?: string | null;
  customer?: { id: string; code?: string; name: string };
  photos: OutboundBoxPhoto[];
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
      product: {
        id?: string;
        sku?: string;
        name: string;
        model?: string | null;
        modelCode?: string | null;
        category?: string | null;
      };
      receivedAt?: string | null;
    };
  }>;
};

type OutboundBoxPhoto = {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  createdAt: string;
  uploadedBy?: { id: string; email: string; name: string };
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
    productSku: item.product.sku,
    productModel: item.product.model,
    productModelCode: item.product.modelCode,
    productCategory: item.product.category,
    imeiOrSerial: item.imei ?? item.serial ?? undefined,
    customerId: item.customer?.id ?? selectedCustomer?.id ?? '',
    customerName: item.customer?.name ?? selectedCustomer?.label ?? '-',
    status: toItemStatus(item.status),
    availableForOutbound: item.availableForOutbound ?? item.status === 'IN_STOCK',
    receivedAt: item.receivedAt,
    latestOutboundBox: item.latestOutboundBox ?? null,
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
    shippingTrackingNo: box.shippingTrackingNo ?? undefined,
    itemCount: box.itemCount,
    photos: box.photos ?? [],
    items: box.items.map((item) => ({
      id: item.inventoryItem.id,
      boxItemId: item.id,
      carrier: detectCarrier(item.inventoryItem.upsTrackingNo),
      trackingNumber: item.inventoryItem.upsTrackingNo ?? '',
      upc: item.inventoryItem.upc,
      productName: item.inventoryItem.product.name,
      productSku: item.inventoryItem.product.sku,
      productModel: item.inventoryItem.product.model,
      productModelCode: item.inventoryItem.product.modelCode,
      productCategory: item.inventoryItem.product.category,
      imeiOrSerial: item.inventoryItem.imei ?? item.inventoryItem.serial ?? undefined,
      customerId: item.inventoryItem.customer?.id ?? box.customer?.id ?? '',
      customerName: item.inventoryItem.customer?.name ?? box.customer?.name ?? '-',
      status: 'packed',
      receivedAt: item.inventoryItem.receivedAt,
      addedAt: item.packedAt,
      raw: item,
    })),
    createdAt: box.createdAt ?? '',
    updatedAt: box.updatedAt ?? box.createdAt ?? '',
    sealedAt: box.sealedAt,
    raw: box,
  };
}

function getBoxDisplayName(box: PackingBox) {
  return box.name || box.boxNo;
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

function toApiAssetUrl(fileUrl: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';
  const apiOrigin = new URL(apiBaseUrl, window.location.origin).origin;
  return new URL(fileUrl, apiOrigin).toString();
}

function toItemStatus(status: string): ItemStatus {
  if (status === 'EXCEPTION') {
    return 'exception';
  }
  if (status === 'PACKED') {
    return 'packed';
  }
  if (status === 'OUTBOUND') {
    return 'outbound';
  }
  if (status === 'VOIDED') {
    return 'voided';
  }
  return 'available';
}

function isPackingItemSelectable(item: PackingItem) {
  return item.status === 'available' && item.availableForOutbound !== false;
}

function getLatestOutboundBoxLabel(item: PackingItem) {
  const box = item.latestOutboundBox;
  if (!box) {
    return '';
  }
  return box.boxName || box.boxNo || '';
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

function buildPrintDetailLines(box: PackingBox) {
  const productCounts = new Map<string, number>();
  for (const item of box.items) {
    const productName = normalizePrintProductName(item.productName ?? item.upc ?? '未命名商品');
    productCounts.set(productName, (productCounts.get(productName) ?? 0) + 1);
  }
  const productLines = Array.from(productCounts.entries()).map(
    ([productName, count]) => `${productName}*${count}`,
  );
  const total = Array.from(productCounts.values()).reduce((sum, count) => sum + count, 0);

  return [
    buildPrintDetailTitle(box),
    getPrintBoxLabel(box),
    ...productLines,
    `|Total: ${total}|`,
  ];
}

function buildPrintDetailTitle(box: PackingBox) {
  return [
    formatPrintMonthDay(box.createdAt || new Date().toISOString()),
    getPrintCustomerName(box),
    getBoxDisplayName(box),
  ]
    .filter(Boolean)
    .join(' ');
}

function getPrintCustomerName(box: PackingBox) {
  return box.raw.customer?.name?.trim() || box.items[0]?.customerName?.trim() || '';
}

function getPrintBoxLabel(box: PackingBox) {
  const displayName = getBoxDisplayName(box);
  const matched = displayName.match(/箱\s*(\d+)/i);
  if (matched?.[1]) {
    return `箱${matched[1]}`;
  }
  return displayName;
}

function normalizePrintProductName(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function formatPrintMonthDay(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function classifyOutboundScanValue(value: string): 'UPC' | 'IMEI_SERIAL' {
  const normalized = value.trim();
  if (/^\d{8,14}$/.test(normalized)) {
    return 'UPC';
  }
  return 'IMEI_SERIAL';
}

function isCompleteOutboundScanValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  if (/^\d+$/.test(normalized)) {
    return normalized.length >= 8;
  }
  return normalized.length >= 6;
}

function normalizeScanText(value?: string | null) {
  return value?.trim().toUpperCase() ?? '';
}

function mergePackingItems(...groups: PackingItem[][]) {
  const byId = new Map<string, PackingItem>();
  for (const group of groups) {
    for (const item of group) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

function normalizeBatchCounts(values: string[]) {
  const counts = values.map((value) => Number(value));
  if (counts.some((value) => !Number.isInteger(value) || value < 0)) {
    return [];
  }
  return counts;
}

function buildBatchGroups(items: PackingItem[], counts: number[]) {
  let cursor = 0;
  return counts.map((count) => {
    const group = items.slice(cursor, cursor + count);
    cursor += count;
    return group;
  });
}

function getSelectedAvailableItems(
  selectedIds: Set<string>,
  cachedItems: Map<string, PackingItem>,
  fallbackItems: PackingItem[],
) {
  if (selectedIds.size === 0) {
    return [];
  }
  const fallbackById = new Map(fallbackItems.map((item) => [item.id, item]));
  return Array.from(selectedIds)
    .map((id) => cachedItems.get(id) ?? fallbackById.get(id))
    .filter((item): item is PackingItem => Boolean(item))
    .filter(isPackingItemSelectable);
}

function matchesProductFilters(
  item: PackingItem,
  condition: ProductConditionFilter,
  device: ProductDeviceFilter,
) {
  if (condition !== 'ALL' && getProductCondition(item) !== condition) {
    return false;
  }
  if (device !== 'ALL' && getProductDevice(item) !== device) {
    return false;
  }
  return true;
}

function getProductCondition(item: PackingItem): Exclude<ProductConditionFilter, 'ALL'> {
  const text = getProductClassificationText(item);
  return /(refurb|renewed|翻新|官翻|整备|rfb|certified pre-owned)/i.test(text)
    ? 'REFURBISHED'
    : 'NEW';
}

function getProductDevice(item: PackingItem): Exclude<ProductDeviceFilter, 'ALL'> | 'UNKNOWN' {
  const text = getProductClassificationText(item);
  if (/ipad/i.test(text)) {
    return 'IPAD';
  }
  if (/iphone/i.test(text)) {
    return 'IPHONE';
  }
  return 'UNKNOWN';
}

function getProductClassificationText(item: PackingItem) {
  return [
    item.upc,
    item.productSku,
    item.productName,
    item.productModel,
    item.productCategory,
  ]
    .filter(Boolean)
    .join(' ');
}

function getProductClassLabel(item: PackingItem) {
  const conditionLabel = getProductCondition(item) === 'REFURBISHED' ? '翻新' : '全新';
  const device = getProductDevice(item);
  const deviceLabel =
    device === 'IPHONE' ? 'iPhone' : device === 'IPAD' ? 'iPad' : '未识别品类';
  return `${conditionLabel} / ${deviceLabel}`;
}

function getProductFilterLabel(condition: ProductConditionFilter, device: ProductDeviceFilter) {
  const conditionLabel =
    condition === 'REFURBISHED' ? '翻新' : condition === 'NEW' ? '全新' : '全部成色';
  const deviceLabel =
    device === 'IPHONE' ? 'iPhone' : device === 'IPAD' ? 'iPad' : '全部品类';
  return `${conditionLabel} / ${deviceLabel}`;
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
