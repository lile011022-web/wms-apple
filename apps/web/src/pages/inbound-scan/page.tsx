import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  FileDown,
  PackageCheck,
  Pencil,
  Plus,
  ScanLine,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getSystemSettings, listWarehouses } from '../../api/settings';
import { customersApi, inboundApi, packagePrealertsApi } from '../../api/workflow';
import { PaginationControls } from '../../components/pagination-controls';
import { packagePrealertsEnabled } from '../../config/feature-flags';
import { selectDefaultWarehouseId } from '../../utils/default-warehouse';

const inboundLockStorageKey = 'wms_scan_inbound_lock';
const inboundImportTemplateHeaders = ['单号', 'upc', 'imei'];
const inboundImportRequiredFields = ['trackingNo', 'upc', 'imei'];
const inboundImportOptionalFields = ['serial'];
const inboundImportHeaderAliases: Record<string, keyof InboundImportRecord> = {
  单号: 'trackingNo',
  物流单号: 'trackingNo',
  trackingNo: 'trackingNo',
  upsTrackingNo: 'trackingNo',
  upc: 'upc',
  UPC: 'upc',
  imei: 'imei',
  IMEI: 'imei',
  serial: 'serial',
  Serial: 'serial',
};
const inboundImportTemplateRows = [
  inboundImportTemplateHeaders,
  ['1Z999AA10123456784', '194253149189', '356789012345678'],
  ['9400111899223857000000', '194253149196', '356789012345679'],
];
const inboundScanModes = {
  STANDARD: {
    label: '一版模式',
    helper: '物流单号、UPC、IMEI 都扫入后自动加入当前入库单。',
  },
  TRACKING_UPC: {
    label: '物流+UPC 模式',
    helper: '只需要物流单号和 UPC，系统自动加入当前入库单。',
  },
} as const;

let inboundScanInputCache = {
  upsTrackingNo: '',
  upc: '',
  imei: '',
};

export function InboundScanPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lockedContext, setLockedContext] = useState<InboundLockContext | null>(() =>
    readInboundLock(),
  );
  const [customerId, setCustomerId] = useState(() => readInboundLock()?.customerId ?? '');
  const [customerAliasId, setCustomerAliasId] = useState(
    () => readInboundLock()?.customerAliasId ?? '',
  );
  const [warehouseId, setWarehouseId] = useState(() => readInboundLock()?.warehouseId ?? '');
  const [draft, setDraft] = useState<InboundDraft | null>(null);
  const [upsTrackingNo, setUpsTrackingNo] = useState(inboundScanInputCache.upsTrackingNo);
  const [upc, setUpc] = useState(inboundScanInputCache.upc);
  const [imei, setImei] = useState(inboundScanInputCache.imei);
  const [scanMode, setScanMode] = useState<InboundScanMode>('STANDARD');
  const [reuseTrackingNo, setReuseTrackingNo] = useState(false);
  const [lastInboundItem, setLastInboundItem] = useState<InboundDraftItem | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [restoreBatchNo, setRestoreBatchNo] = useState('');
  const [trackingWarning, setTrackingWarning] = useState<TrackingWarning | null>(null);
  const [prealertMatch, setPrealertMatch] = useState<PackagePrealertMatch | null>(null);
  const [isCheckingTracking, setIsCheckingTracking] = useState(false);
  const [pendingScanFocus, setPendingScanFocus] = useState<InboundScanField | null>(null);
  const [importRows, setImportRows] = useState<ImportInboundItemRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importFailedRows, setImportFailedRows] = useState<ImportFailedRow[]>([]);
  const trackingInputRef = useRef<HTMLInputElement | null>(null);
  const upcInputRef = useRef<HTMLInputElement | null>(null);
  const imeiInputRef = useRef<HTMLInputElement | null>(null);
  const lastAutoAddKeyRef = useRef('');
  const hasFocusedLockedDraftRef = useRef(false);

  const customersQuery = useQuery({
    queryKey: ['customer-options'],
    queryFn: () => customersApi.options(),
  });
  const customerAliasesQuery = useQuery({
    queryKey: ['customer-alias-options', customerId],
    queryFn: () => customersApi.aliasOptions({ customerId }),
    enabled: Boolean(customerId),
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
  const customerAliases = (customerAliasesQuery.data as CustomerAliasOption[] | undefined) ?? [];
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
          customerAliasId: lockedContext.customerAliasId,
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
    (lockedContext.customerAliasId ?? '') === customerAliasId &&
    lockedContext.warehouseId === warehouseId;
  const isDraftOpen = draft?.status === 'DRAFT';
  const latestDraftItem = draft?.items.at(-1);
  const blockingExceptionItem =
    isDraftOpen && latestDraftItem?.status === 'EXCEPTION' ? latestDraftItem : null;
  const normalizedTrackingInput = normalizeTrackingInput(upsTrackingNo);
  const activeTrackingWarning =
    trackingWarning?.trackingNo === normalizedTrackingInput ? trackingWarning : null;
  const isReusableTrackingWarningConfirmed =
    reuseTrackingNo &&
    !!activeTrackingWarning &&
    isCurrentDraftDuplicateTrackingOnly(activeTrackingWarning.reasons);
  const isTrackingWarningConfirmed =
    !!activeTrackingWarning?.confirmed || isReusableTrackingWarningConfirmed;
  const isTrackingWarningBlocking =
    !!activeTrackingWarning &&
    !activeTrackingWarning.confirmed &&
    !isReusableTrackingWarningConfirmed;
  const draftIdentityDuplicates = useMemo(
    () => findDraftIdentityDuplicates(draft?.items ?? []),
    [draft?.items],
  );
  const activeDraftIdentityDuplicate =
    scanMode === 'STANDARD' ? findDraftIdentityDuplicate(draft?.items ?? [], imei) : null;
  const canAddCurrentScan =
    isCurrentSelectionLocked &&
    !blockingExceptionItem &&
    !isTrackingWarningBlocking &&
    !activeDraftIdentityDuplicate &&
    !isCheckingTracking &&
    !!upsTrackingNo.trim() &&
    !!upc.trim() &&
    (scanMode === 'TRACKING_UPC' || !!imei.trim());

  const persistLockedContext = (context: InboundLockContext) => {
    setLockedContext(context);
    writeInboundLock(context);
  };

  const clearLockedContext = () => {
    setDraft(null);
    setLockedContext(null);
    setPrealertMatch(null);
    removeInboundLock();
  };

  const updateScanInputCache = (values: Partial<typeof inboundScanInputCache>) => {
    inboundScanInputCache = {
      ...inboundScanInputCache,
      ...values,
    };
  };

  const focusScanInput = useCallback((field: InboundScanField, options?: { retry?: boolean }) => {
    const focus = () => {
      const input =
        field === 'tracking'
          ? trackingInputRef.current
          : field === 'upc'
            ? upcInputRef.current
            : imeiInputRef.current;
      input?.focus();
      input?.select();
    };

    window.setTimeout(focus, 0);
    if (options?.retry) {
      window.setTimeout(focus, 60);
      window.setTimeout(focus, 180);
    }
  }, []);

  const focusNextScanStart = useCallback(() => {
    const nextField = reuseTrackingNo ? 'upc' : 'tracking';
    setPendingScanFocus(nextField);
    focusScanInput(nextField, { retry: true });
  }, [focusScanInput, reuseTrackingNo]);

  const clearScanInputs = (options?: { keepTrackingNo?: boolean }) => {
    const nextTrackingNo = options?.keepTrackingNo ? upsTrackingNo : '';
    inboundScanInputCache = {
      upsTrackingNo: nextTrackingNo,
      upc: '',
      imei: '',
    };
    if (!options?.keepTrackingNo) {
      setTrackingWarning(null);
      setPrealertMatch(null);
    }
    setUpsTrackingNo(nextTrackingNo);
    setUpc('');
    setImei('');
  };

  const updateScanMode = (nextScanMode: InboundScanMode) => {
    setScanMode(nextScanMode);
    lastAutoAddKeyRef.current = '';
    if (nextScanMode === 'TRACKING_UPC') {
      setImei('');
      updateScanInputCache({ imei: '' });
      focusScanInput(upc ? 'upc' : reuseTrackingNo && upsTrackingNo.trim() ? 'upc' : 'tracking');
    } else {
      focusScanInput(
        upc.trim() ? 'imei' : reuseTrackingNo && upsTrackingNo.trim() ? 'upc' : 'tracking',
      );
    }
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
      customerAliasId: customerAliasId || undefined,
      warehouseId,
      notes: 'Web local test',
    })) as InboundDraft;
    setDraft(nextDraft);
    persistLockedContext({ customerId, customerAliasId, warehouseId, draftId: nextDraft.id });
    return nextDraft;
  };

  const reviewTrackingInput = useCallback(async () => {
    const normalized = normalizeTrackingInput(upsTrackingNo);
    if (!normalized) {
      throw new Error('请先扫描物流单号');
    }
    if (
      activeTrackingWarning?.trackingNo === normalized &&
      (activeTrackingWarning.confirmed || isReusableTrackingWarningConfirmed)
    ) {
      return true;
    }
    if (blockingExceptionItem) {
      throw new Error('上一条入库明细仍为异常，请先在当前入库单中修正该异常后再继续入库。');
    }

    setIsCheckingTracking(true);
    try {
      const activeDraft = await ensureDraft();
      const scanResult = (await inboundApi.scanUps(activeDraft.id, {
        upsTrackingNo: upsTrackingNo.trim(),
      })) as TrackingScanResult;
      const reasons = buildTrackingWarningReasons(scanResult);
      if (reasons.length === 0) {
        setTrackingWarning(null);
        return true;
      }

      setTrackingWarning({
        trackingNo: scanResult.upsTrackingNo,
        reasons,
        confirmed: reuseTrackingNo && isCurrentDraftDuplicateTrackingOnly(reasons),
      });
      if (reuseTrackingNo && isCurrentDraftDuplicateTrackingOnly(reasons)) {
        return true;
      }
      setMessage('');
      setErrorMessage('该物流单号需要手动确认后才能继续入库。');
      focusScanInput('tracking');
      return false;
    } finally {
      setIsCheckingTracking(false);
    }
  }, [
    activeTrackingWarning,
    blockingExceptionItem,
    customerId,
    draft,
    focusScanInput,
    isReusableTrackingWarningConfirmed,
    isCurrentSelectionLocked,
    isDraftOpen,
    reuseTrackingNo,
    upsTrackingNo,
    warehouseId,
  ]);

  const createDraftMutation = useMutation({
    mutationFn: () =>
      inboundApi.createDraft({
        customerId,
        customerAliasId: customerAliasId || undefined,
        warehouseId,
        notes: 'Web local test',
      }),
    onMutate: () => {
      setMessage('');
      setErrorMessage('');
    },
    onSuccess: (data) => {
      const nextDraft = data as InboundDraft;
      setDraft(nextDraft);
      persistLockedContext({ customerId, customerAliasId, warehouseId, draftId: nextDraft.id });
      setMessage('已锁定客户并创建入库草稿');
      hasFocusedLockedDraftRef.current = true;
      focusNextScanStart();
    },
    onError: (error) => {
      setErrorMessage(toUserErrorMessage(error, '创建入库草稿失败'));
    },
  });
  const restoreDraftMutation = useMutation({
    mutationFn: async () => {
      const batchNo = restoreBatchNo.trim();
      if (!batchNo) {
        throw new Error('请输入入库单号');
      }
      return inboundApi.getDraftByBatchNo(batchNo);
    },
    onMutate: () => {
      setMessage('');
      setErrorMessage('');
    },
    onSuccess: (data) => {
      const restoredDraft = data as InboundDraft;
      setDraft(restoredDraft);
      setCustomerId(restoredDraft.customer.id);
      setCustomerAliasId(restoredDraft.customerAlias?.id ?? '');
      setWarehouseId(restoredDraft.warehouse.id);
      persistLockedContext({
        customerId: restoredDraft.customer.id,
        customerAliasId: restoredDraft.customerAlias?.id ?? '',
        warehouseId: restoredDraft.warehouse.id,
        draftId: restoredDraft.id,
      });
      setRestoreBatchNo(restoredDraft.batchNo);
      clearScanInputs();
      setLastInboundItem(null);
      setTrackingWarning(null);
      setMessage(`已恢复入库单 ${restoredDraft.batchNo}`);
      hasFocusedLockedDraftRef.current = true;
      focusNextScanStart();
    },
    onError: (error) => {
      setErrorMessage(toUserErrorMessage(error, '恢复入库单失败'));
    },
  });
  const addItemMutation = useMutation({
    mutationFn: async () => {
      if (blockingExceptionItem) {
        throw new Error('上一条入库明细仍为异常，请先在当前入库单中修正该异常后再继续入库。');
      }
      const trackingReviewed = await reviewTrackingInput();
      if (!trackingReviewed) {
        throw new Error('请先手动确认物流单号后再加入明细。');
      }
      const activeDraft = await ensureDraft();
      const duplicateIdentity = findDraftIdentityDuplicate(activeDraft.items, imei);
      if (scanMode === 'STANDARD' && duplicateIdentity) {
        throw new Error(
          `当前入库单内 IMEI 已重复: ${duplicateIdentity}。请修正或删除重复明细后再继续入库。`,
        );
      }
      const item = (await inboundApi.addItem(activeDraft.id, {
        upsTrackingNo: upsTrackingNo.trim() || undefined,
        upc: upc.trim(),
        imei: scanMode === 'STANDARD' ? imei.trim() : undefined,
        scanMode,
        trackingExceptionConfirmed: isTrackingWarningConfirmed || undefined,
      })) as InboundDraftItem;
      const nextDraft = (await inboundApi.getDraft(activeDraft.id)) as InboundDraft;
      return { draft: nextDraft, item };
    },
    onMutate: () => {
      setMessage('');
      setErrorMessage('');
    },
    onSuccess: (data) => {
      const updated = data.draft;
      setDraft(updated);
      persistLockedContext({ customerId, customerAliasId, warehouseId, draftId: updated.id });
      setLastInboundItem(data.item);
      const keepTrackingNo = reuseTrackingNo && data.item.status !== 'EXCEPTION';
      const nextFocusField =
        data.item.status === 'EXCEPTION' ? null : keepTrackingNo ? 'upc' : 'tracking';
      clearScanInputs({ keepTrackingNo });
      lastAutoAddKeyRef.current = '';
      setPendingScanFocus(nextFocusField);
      setMessage(
        data.item.status === 'EXCEPTION'
          ? '已加入异常明细，请点击下方异常定位查看'
          : '已自动加入当前入库单',
      );
    },
    onError: (error) => {
      lastAutoAddKeyRef.current = '';
      setErrorMessage(toUserErrorMessage(error, '添加入库明细失败'));
    },
  });
  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('请先创建入库草稿');
      if (blockingExceptionItem) {
        throw new Error('上一条入库明细仍为异常，请先在当前入库单中修正该异常后再确认入库。');
      }
      return inboundApi.confirmDraft(draft.id);
    },
    onMutate: () => {
      setMessage('');
      setErrorMessage('');
    },
    onSuccess: (data) => {
      const confirmedDraft = data as InboundDraft;
      setDraft(confirmedDraft);
      persistLockedContext({ customerId, customerAliasId, warehouseId });
      setMessage('入库已确认，库存已生成');
      queryClient.invalidateQueries({ queryKey: ['inventory-customer-summary'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      focusScanInput('tracking');
    },
    onError: (error) => {
      setErrorMessage(toUserErrorMessage(error, '确认入库失败'));
    },
  });
  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      if (!draft) throw new Error('请先创建入库草稿');
      await inboundApi.removeItem(draft.id, itemId);
      return inboundApi.getDraft(draft.id);
    },
    onMutate: () => {
      setMessage('');
      setErrorMessage('');
    },
    onSuccess: (data) => {
      const updated = data as InboundDraft;
      setDraft(updated);
      persistLockedContext({ customerId, customerAliasId, warehouseId, draftId: updated.id });
      setMessage('已删除入库明细');
      if (updated.status === 'DRAFT' && updated.items.at(-1)?.status !== 'EXCEPTION') {
        focusNextScanStart();
      }
    },
    onError: (error) => {
      setErrorMessage(toUserErrorMessage(error, '删除入库明细失败'));
    },
  });
  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, values }: { itemId: string; values: EditInboundItemValues }) => {
      if (!draft) throw new Error('请先创建入库草稿');
      const imeiValue = values.imei.trim();
      const updatedItem = (await inboundApi.updateItem(draft.id, itemId, {
        upsTrackingNo: values.upsTrackingNo.trim() || undefined,
        upc: values.upc.trim(),
        imei: imeiValue || undefined,
        scanMode: imeiValue ? 'STANDARD' : 'TRACKING_UPC',
        trackingExceptionConfirmed: true,
      })) as InboundDraftItem;
      const updatedDraft = (await inboundApi.getDraft(draft.id)) as InboundDraft;
      return { draft: updatedDraft, item: updatedItem };
    },
    onMutate: () => {
      setMessage('');
      setErrorMessage('');
    },
    onSuccess: (data) => {
      setDraft(data.draft);
      persistLockedContext({ customerId, customerAliasId, warehouseId, draftId: data.draft.id });
      setLastInboundItem(data.item);
      setMessage(
        data.item.status === 'EXCEPTION'
          ? '已覆盖原明细，当前仍为异常'
          : '已覆盖原明细，异常已修正',
      );
      if (data.item.status !== 'EXCEPTION') {
        focusNextScanStart();
      }
    },
    onError: (error) => {
      setErrorMessage(toUserErrorMessage(error, '修正入库明细失败'));
    },
  });
  const importItemsMutation = useMutation({
    mutationFn: async () => {
      if (blockingExceptionItem) {
        throw new Error('上一条入库明细仍为异常，请先在当前入库单中修正该异常后再继续入库。');
      }
      const activeDraft = await ensureDraft();
      return inboundApi.importItems(activeDraft.id, { items: importRows });
    },
    onMutate: () => {
      setMessage('');
      setErrorMessage('');
      setImportFailedRows([]);
    },
    onSuccess: (data) => {
      const result = data as ImportInboundResult;
      setDraft(result.draft);
      persistLockedContext({ customerId, customerAliasId, warehouseId, draftId: result.draft.id });
      setImportFailedRows(result.failedRows);
      setImportRows([]);
      setImportFileName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setMessage(
        result.failedCount > 0
          ? `文件导入完成：成功 ${result.importedCount} 行，失败 ${result.failedCount} 行`
          : `文件导入完成：成功 ${result.importedCount} 行`,
      );
    },
    onError: (error) => {
      setErrorMessage(toUserErrorMessage(error, '文件导入失败'));
    },
  });

  useEffect(() => {
    if (!pendingScanFocus || blockingExceptionItem) {
      return;
    }

    const timer = window.setTimeout(() => {
      focusScanInput(pendingScanFocus, { retry: true });
      setPendingScanFocus(null);
    }, 30);

    return () => window.clearTimeout(timer);
  }, [blockingExceptionItem, focusScanInput, imei, pendingScanFocus, scanMode, upc, upsTrackingNo]);

  useEffect(() => {
    const normalized = normalizeTrackingInput(upsTrackingNo);
    if (
      !normalized ||
      normalized.length < 8 ||
      !isCurrentSelectionLocked ||
      blockingExceptionItem
    ) {
      if (trackingWarning && trackingWarning.trackingNo !== normalized) {
        setTrackingWarning(null);
      }
      return;
    }
    if (trackingWarning?.trackingNo === normalized) {
      return;
    }

    const timer = window.setTimeout(() => {
      ensureDraft()
        .then((activeDraft) =>
          inboundApi.scanUps(activeDraft.id, { upsTrackingNo: upsTrackingNo.trim() }),
        )
        .then((result) => {
          const scanResult = result as TrackingScanResult;
          const reasons = buildTrackingWarningReasons(scanResult);
          if (reasons.length === 0) {
            setTrackingWarning(null);
            return;
          }
          setTrackingWarning({
            trackingNo: scanResult.upsTrackingNo,
            reasons,
            confirmed: reuseTrackingNo && isCurrentDraftDuplicateTrackingOnly(reasons),
          });
        })
        .catch((error) => {
          setTrackingWarning({
            trackingNo: normalized,
            reasons: [toUserErrorMessage(error, '物流单号检查失败')],
            confirmed: false,
          });
        });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [blockingExceptionItem, isCurrentSelectionLocked, trackingWarning, upsTrackingNo]);

  useEffect(() => {
    const normalized = normalizeTrackingInput(upsTrackingNo);
    if (!packagePrealertsEnabled || !normalized || normalized.length < 8 || blockingExceptionItem) {
      setPrealertMatch(null);
      return;
    }

    const timer = window.setTimeout(() => {
      packagePrealertsApi
        .match(normalized)
        .then((result) => {
          const match = result as PackagePrealertMatch;
          setPrealertMatch(match);
          if (match.matched && match.customer) {
            if (!isCurrentSelectionLocked) {
              setCustomerId(match.customer.id);
              setMessage(`已根据预报单号匹配客户：${match.customer.code} / ${match.customer.name}`);
              setErrorMessage('');
            } else if (customerId !== match.customer.id) {
              setErrorMessage(
                `该单号预报客户是 ${match.customer.code} / ${match.customer.name}，当前锁定客户不同，请先核对。`,
              );
            }
          }
        })
        .catch(() => {
          setPrealertMatch(null);
        });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [blockingExceptionItem, customerId, isCurrentSelectionLocked, upsTrackingNo]);

  const handleReuseTrackingChange = async (checked: boolean) => {
    if (!checked) {
      setReuseTrackingNo(false);
      focusScanInput('tracking');
      return;
    }

    try {
      const trackingReviewed = await reviewTrackingInput();
      if (!trackingReviewed) {
        setReuseTrackingNo(false);
        return;
      }
      setReuseTrackingNo(true);
      focusScanInput('upc');
    } catch (error) {
      setReuseTrackingNo(false);
      setMessage('');
      setErrorMessage(toUserErrorMessage(error, '物流单号检查失败'));
      focusScanInput('tracking');
    }
  };

  const handleCreateDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createDraftMutation.mutate();
  };

  const handleTemplateDownload = () => {
    const content = toCsv(inboundImportTemplateRows);
    downloadTextFile('inbound-items-import-template.csv', content, 'text/csv; charset=utf-8');
  };

  const handleScanKeyDown = (event: KeyboardEvent<HTMLInputElement>, field: InboundScanField) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    if (field === 'tracking') {
      focusScanInput('upc');
      return;
    }
    if (field === 'upc' && scanMode === 'STANDARD') {
      focusScanInput('imei');
      return;
    }
    if (canAddCurrentScan && !addItemMutation.isPending) {
      addItemMutation.mutate();
    }
  };

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const rows = parseInboundImportCsv(await file.text());
      setImportRows(rows);
      setImportFileName(file.name);
      setImportFailedRows([]);
      setMessage(`已读取 ${file.name}：${rows.length} 行待导入`);
      setErrorMessage('');
    } catch (error) {
      setImportRows([]);
      setImportFileName('');
      setImportFailedRows([]);
      setErrorMessage(toUserErrorMessage(error, '导入文件解析失败'));
    }
  };

  useEffect(() => {
    if (!canAddCurrentScan || addItemMutation.isPending) {
      return;
    }

    const scanKey = [scanMode, upsTrackingNo.trim(), upc.trim(), imei.trim()].join('|');
    if (lastAutoAddKeyRef.current === scanKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastAutoAddKeyRef.current = scanKey;
      addItemMutation.mutate();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    addItemMutation.isPending,
    canAddCurrentScan,
    imei,
    isTrackingWarningConfirmed,
    scanMode,
    upc,
    upsTrackingNo,
  ]);

  useEffect(() => {
    if (
      !isCurrentSelectionLocked ||
      blockingExceptionItem ||
      addItemMutation.isPending ||
      !isLikelyCompleteTrackingInput(upsTrackingNo) ||
      upc.trim()
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (document.activeElement === trackingInputRef.current) {
        focusScanInput('upc', { retry: true });
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [
    addItemMutation.isPending,
    blockingExceptionItem,
    focusScanInput,
    isCurrentSelectionLocked,
    upc,
    upsTrackingNo,
  ]);

  useEffect(() => {
    if (
      scanMode !== 'STANDARD' ||
      !isCurrentSelectionLocked ||
      blockingExceptionItem ||
      isTrackingWarningBlocking ||
      addItemMutation.isPending ||
      !upsTrackingNo.trim() ||
      upc.trim().length < 12 ||
      imei.trim()
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (document.activeElement === upcInputRef.current) {
        focusScanInput('imei', { retry: true });
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [
    addItemMutation.isPending,
    blockingExceptionItem,
    focusScanInput,
    imei,
    isCurrentSelectionLocked,
    isTrackingWarningBlocking,
    scanMode,
    upc,
    upsTrackingNo,
  ]);

  useEffect(() => {
    hasFocusedLockedDraftRef.current = false;
  }, [lockedContext?.draftId]);

  useEffect(() => {
    if (
      !isCurrentSelectionLocked ||
      blockingExceptionItem ||
      activeTrackingWarning ||
      hasFocusedLockedDraftRef.current
    ) {
      return;
    }

    hasFocusedLockedDraftRef.current = true;
    focusNextScanStart();
  }, [
    activeTrackingWarning,
    blockingExceptionItem,
    focusNextScanStart,
    isCurrentSelectionLocked,
    lockedContext?.draftId,
  ]);

  return (
    <section className="page-frame">
      <div className="page-heading">
        <div>
          <p>Inbound</p>
          <h1>扫码入库</h1>
        </div>
        <div className="heading-import-form">
          <label>
            <span>批量入库文件</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              disabled={!!blockingExceptionItem}
              onChange={handleImportFileChange}
            />
          </label>
          <button type="button" onClick={handleTemplateDownload}>
            <FileDown size={16} />
            下载入库模板
          </button>
          <button
            type="button"
            disabled={
              !isCurrentSelectionLocked ||
              importRows.length === 0 ||
              importItemsMutation.isPending ||
              !!blockingExceptionItem
            }
            onClick={() => importItemsMutation.mutate()}
          >
            <Upload size={16} />
            {importItemsMutation.isPending ? '导入中' : '导入到当前单'}
          </button>
          {importRows.length > 0 ? (
            <strong>
              {importFileName} / {importRows.length} 行
            </strong>
          ) : null}
        </div>
      </div>

      <form className="panel workflow-form" onSubmit={handleCreateDraft}>
        <label>
          <span>客户</span>
          <select
            value={customerId}
            onChange={(event) => {
              clearLockedContext();
              setCustomerId(event.target.value);
              setCustomerAliasId('');
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
          <span>子客户 / 别名</span>
          <select
            value={customerAliasId}
            disabled={!customerId || isCurrentSelectionLocked}
            onChange={(event) => {
              clearLockedContext();
              setCustomerAliasId(event.target.value);
            }}
          >
            <option value="">不选择，直接归父客户</option>
            {customerAliases.map((alias) => (
              <option key={alias.id} value={alias.id}>
                {alias.code} - {alias.name}
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

      <section className="panel inbound-entry-panel">
        <div className="workflow-form">
          <div className="inbound-mode-switch" role="group" aria-label="入库模式">
            {Object.entries(inboundScanModes).map(([mode, option]) => (
              <button
                key={mode}
                type="button"
                className={scanMode === mode ? 'active' : ''}
                disabled={!!blockingExceptionItem}
                onClick={() => updateScanMode(mode as InboundScanMode)}
              >
                <strong>{option.label}</strong>
                <span>{option.helper}</span>
              </button>
            ))}
          </div>
          <label className="scan-flow-option">
            <input
              type="checkbox"
              checked={reuseTrackingNo}
              disabled={!!blockingExceptionItem || isCheckingTracking}
              onChange={(event) => void handleReuseTrackingChange(event.target.checked)}
            />
            <span>同一物流单连续扫</span>
          </label>
          <label>
            <span>物流单号</span>
            <input
              ref={trackingInputRef}
              value={upsTrackingNo}
              placeholder="UPS / USPS / FedEx / BB0000"
              disabled={!!blockingExceptionItem}
              onKeyDown={(event) => handleScanKeyDown(event, 'tracking')}
              onChange={(event) => {
                setUpsTrackingNo(event.target.value);
                updateScanInputCache({ upsTrackingNo: event.target.value });
              }}
            />
          </label>
          {packagePrealertsEnabled && prealertMatch ? (
            <div
              className={`prealert-match-card ${prealertMatch.matched ? 'matched' : 'unmatched'}`}
            >
              {prealertMatch.matched && prealertMatch.customer ? (
                <>
                  <strong>已匹配预报客户</strong>
                  <span>
                    {prealertMatch.customer.code} / {prealertMatch.customer.name}
                    {prealertMatch.prealert ? ` / ${prealertMatch.prealert.batch.batchNo}` : ''}
                  </span>
                </>
              ) : (
                <>
                  <strong>未自动匹配</strong>
                  <span>
                    {prealertMatch.reason === 'CUSTOMER_CONFLICT'
                      ? '该单号存在客户冲突，请先处理预报。'
                      : '该单号暂无有效预报，可按原流程手动选择客户。'}
                  </span>
                </>
              )}
            </div>
          ) : null}
          <label>
            <span>UPC</span>
            <input
              ref={upcInputRef}
              value={upc}
              disabled={!!blockingExceptionItem}
              onKeyDown={(event) => handleScanKeyDown(event, 'upc')}
              onChange={(event) => {
                setUpc(event.target.value);
                updateScanInputCache({ upc: event.target.value });
              }}
            />
          </label>
          <label>
            <span>IMEI</span>
            <input
              ref={imeiInputRef}
              disabled={!!blockingExceptionItem || scanMode === 'TRACKING_UPC'}
              placeholder={scanMode === 'TRACKING_UPC' ? '当前模式不需要 IMEI' : undefined}
              value={imei}
              onKeyDown={(event) => handleScanKeyDown(event, 'imei')}
              onChange={(event) => {
                setImei(event.target.value);
                updateScanInputCache({ imei: event.target.value });
              }}
            />
          </label>
          <button
            type="button"
            disabled={!canAddCurrentScan || addItemMutation.isPending || isCheckingTracking}
            onClick={() => addItemMutation.mutate()}
            title="当前模式所需字段填写完整后会自动加入明细，也可手动点击补提交"
          >
            <Plus size={16} />
            {isCheckingTracking ? '检查中' : addItemMutation.isPending ? '添加中' : '加入明细'}
          </button>
          <button
            type="button"
            disabled={
              !isDraftOpen ||
              !!blockingExceptionItem ||
              draftIdentityDuplicates.length > 0 ||
              confirmMutation.isPending
            }
            onClick={() => confirmMutation.mutate()}
          >
            <PackageCheck size={16} />
            {confirmMutation.isPending ? '确认中' : '确认入库'}
          </button>
        </div>
        {activeTrackingWarning ? (
          <div
            className={`tracking-warning-bar ${activeTrackingWarning.confirmed ? 'confirmed' : ''}`}
          >
            <div>
              <strong>物流单号异常</strong>
              <span>{activeTrackingWarning.reasons.join('，')}</span>
            </div>
            {activeTrackingWarning.confirmed ? (
              <strong>已确认继续入库</strong>
            ) : (
              <div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setTrackingWarning(null);
                    setUpsTrackingNo('');
                    updateScanInputCache({ upsTrackingNo: '' });
                    focusScanInput('tracking');
                  }}
                >
                  修改单号
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextField = upc.trim()
                      ? scanMode === 'STANDARD'
                        ? 'imei'
                        : 'upc'
                      : 'upc';
                    setTrackingWarning((current) =>
                      current?.trackingNo === activeTrackingWarning.trackingNo
                        ? { ...current, confirmed: true }
                        : current,
                    );
                    setPendingScanFocus(nextField);
                    focusScanInput(nextField, { retry: true });
                  }}
                >
                  继续入库
                </button>
              </div>
            )}
          </div>
        ) : null}
        <LastInboundNotice
          item={lastInboundItem ?? latestDraftItem ?? null}
          isUpdating={updateItemMutation.isPending}
          onUpdateItem={(itemId, values) => updateItemMutation.mutateAsync({ itemId, values })}
        />
      </section>

      {blockingExceptionItem ? (
        <div className="inline-error">
          上一条入库明细是异常，已暂停继续入库。请先在下方最后一条异常行点击“修正”并保存。
        </div>
      ) : null}

      {message ? <div className="inline-success">{message}</div> : null}
      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}
      {importFailedRows.length > 0 ? (
        <div className="inline-error">
          {importFailedRows.slice(0, 5).map((row) => (
            <div key={`${row.lineNo}-${row.upc ?? ''}`}>
              第 {row.lineNo} 行：{row.message}
            </div>
          ))}
          {importFailedRows.length > 5 ? (
            <div>另有 {importFailedRows.length - 5} 行失败</div>
          ) : null}
        </div>
      ) : null}
      {activeDraftIdentityDuplicate ? (
        <div className="tracking-warning-bar">
          <div>
            <strong>IMEI 重复</strong>
            <span>
              当前入库单内已存在 {activeDraftIdentityDuplicate}，请修正或删除重复明细后再继续入库。
            </span>
          </div>
        </div>
      ) : null}
      {draftIdentityDuplicates.length > 0 ? (
        <div className="tracking-warning-bar">
          <div>
            <strong>入库单内有重复 IMEI/Serial</strong>
            <span>
              重复值：{draftIdentityDuplicates.join(', ')}。请删除或编辑重复明细后再确认入库。
            </span>
          </div>
        </div>
      ) : null}
      <DraftPanel
        draft={draft}
        restoreBatchNo={restoreBatchNo}
        isRestoringDraft={restoreDraftMutation.isPending}
        onRestoreBatchNoChange={setRestoreBatchNo}
        onRestoreDraft={() => restoreDraftMutation.mutate()}
        blockingExceptionItemId={blockingExceptionItem?.id}
        removingItemId={removeItemMutation.isPending ? removeItemMutation.variables : undefined}
        updatingItemId={
          updateItemMutation.isPending ? updateItemMutation.variables?.itemId : undefined
        }
        onUpdateItem={(itemId, values) => updateItemMutation.mutateAsync({ itemId, values })}
        onRemoveItem={(itemId) => removeItemMutation.mutate(itemId)}
      />
    </section>
  );
}

type CustomerOption = { id: string; label: string };
type CustomerAliasOption = { id: string; code: string; name: string; label: string };
type InboundLockContext = {
  customerId: string;
  customerAliasId?: string;
  warehouseId: string;
  draftId?: string;
};
type InboundScanMode = keyof typeof inboundScanModes;
type InboundScanField = 'tracking' | 'upc' | 'imei';
type InboundDraftItem = {
  id: string;
  upsTrackingNo: string | null;
  upc: string;
  imei: string | null;
  serial?: string | null;
  status: string;
  scannedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  product?: { name: string; modelCode?: string | null } | null;
  exceptions?: Array<{
    id: string;
    type: string;
    status: string;
    rawValue?: string | null;
  }>;
};
type EditInboundItemValues = {
  upsTrackingNo: string;
  upc: string;
  imei: string;
};
type InboundDraft = {
  id: string;
  batchNo: string;
  status: string;
  customer: {
    id: string;
    code: string;
    name: string;
  };
  customerAlias?: {
    id: string;
    code: string;
    name: string;
  } | null;
  warehouse: {
    id: string;
    code: string;
    name: string;
    timezone: string;
  };
  summary: {
    totalItems: number;
    pendingItems: number;
    confirmedItems: number;
    exceptionItems: number;
  };
  items: InboundDraftItem[];
};
type ImportInboundItemRow = {
  upsTrackingNo?: string;
  upc: string;
  imei?: string;
  serial?: string;
};
type ImportFailedRow = {
  lineNo: number;
  upc?: string;
  upsTrackingNo?: string;
  imei?: string;
  serial?: string;
  message: string;
};
type ImportInboundResult = {
  importedCount: number;
  failedCount: number;
  failedRows: ImportFailedRow[];
  draft: InboundDraft;
};
type PackagePrealertMatch = {
  matched: boolean;
  reason?: string;
  trackingNo: string;
  customer?: {
    id: string;
    code: string;
    name: string;
  };
  prealert?: {
    id: string;
    batch: {
      batchNo: string;
    };
  };
};
type TrackingWarning = {
  trackingNo: string;
  reasons: string[];
  confirmed: boolean;
};
type TrackingScanResult = {
  upsTrackingNo: string;
  valid: boolean;
  duplicate: boolean;
  duplicateCount: number;
  currentDraftDuplicate?: boolean;
  currentDraftDuplicateCount?: number;
};

function DraftPanel({
  draft,
  restoreBatchNo,
  isRestoringDraft,
  onRestoreBatchNoChange,
  onRestoreDraft,
  blockingExceptionItemId,
  removingItemId,
  updatingItemId,
  onUpdateItem,
  onRemoveItem,
}: {
  draft: InboundDraft | null;
  restoreBatchNo: string;
  isRestoringDraft: boolean;
  onRestoreBatchNoChange: (value: string) => void;
  onRestoreDraft: () => void;
  blockingExceptionItemId?: string;
  removingItemId?: string;
  updatingItemId?: string;
  onUpdateItem: (itemId: string, values: EditInboundItemValues) => Promise<unknown>;
  onRemoveItem: (itemId: string) => void;
}) {
  const canRemoveItems = draft?.status === 'DRAFT';
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [activeExceptionItemId, setActiveExceptionItemId] = useState('');
  const [editingItemId, setEditingItemId] = useState('');
  const [editValues, setEditValues] = useState<EditInboundItemValues>({
    upsTrackingNo: '',
    upc: '',
    imei: '',
  });
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const reviewSummary = useMemo(() => buildInboundReviewSummary(draft), [draft]);
  const items = useMemo(() => sortInboundDraftItems(draft?.items ?? []), [draft?.items]);
  const paginatedItems = paginateItems(items, page, pageSize);
  const blockingExceptionItem = blockingExceptionItemId
    ? items.find((item) => item.id === blockingExceptionItemId)
    : undefined;
  const firstExceptionItem =
    blockingExceptionItem ?? items.find((item) => item.status === 'EXCEPTION');

  useEffect(() => {
    setPage(1);
    setActiveExceptionItemId('');
    setEditingItemId('');
  }, [draft?.id, items.length]);

  const focusExceptionItem = (item: InboundDraftItem) => {
    const itemIndex = items.findIndex((candidate) => candidate.id === item.id);
    if (itemIndex >= 0) {
      setPage(Math.floor(itemIndex / pageSize) + 1);
    }
    setActiveExceptionItemId(item.id);
    startEditingItem(item);
    window.setTimeout(() => {
      rowRefs.current[item.id]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 0);
  };

  const startEditingItem = (item: InboundDraftItem) => {
    setEditingItemId(item.id);
    setEditValues({
      upsTrackingNo: item.upsTrackingNo ?? '',
      upc: item.upc,
      imei: item.imei ?? item.serial ?? '',
    });
    setActiveExceptionItemId(item.id);
  };

  const updateEditValue = (field: keyof EditInboundItemValues, value: string) => {
    setEditValues((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveEditingItem = async (itemId: string) => {
    try {
      await onUpdateItem(itemId, editValues);
      setEditingItemId('');
    } catch {
      // Keep the row in edit mode so the operator can fix the values and save again.
    }
  };

  return (
    <section className="panel data-panel">
      <div className="section-title inbound-draft-title">
        <div>
          <h2>当前入库单</h2>
          <span>{draft ? `${draft.batchNo} / ${draft.status}` : '尚未创建'}</span>
        </div>
        <form
          className="restore-draft-form"
          onSubmit={(event) => {
            event.preventDefault();
            onRestoreDraft();
          }}
        >
          <label>
            <span>按入库单号恢复</span>
            <input
              value={restoreBatchNo}
              placeholder="INB-20260701152205-Q2QEUT"
              onChange={(event) => onRestoreBatchNoChange(event.target.value)}
            />
          </label>
          <button type="submit" disabled={isRestoringDraft || !restoreBatchNo.trim()}>
            {isRestoringDraft ? '恢复中' : '恢复草稿'}
          </button>
        </form>
      </div>
      <div className="inbound-review-grid">
        <SummaryMetric label="产品件数" value={reviewSummary.totalItems} />
        <SummaryMetric label="UPC 种类" value={reviewSummary.upcCount} />
        <SummaryMetric label="商品款数" value={reviewSummary.productCount} />
        <SummaryMetric label="物流单号" value={reviewSummary.trackingCount} />
        <SummaryMetric label="待确认" value={draft?.summary.pendingItems ?? 0} />
        <SummaryMetric
          label="异常"
          value={draft?.summary.exceptionItems ?? 0}
          tone="warning"
          disabled={!firstExceptionItem}
          onClick={firstExceptionItem ? () => focusExceptionItem(firstExceptionItem) : undefined}
        />
      </div>
      <div className="upc-review-list">
        <div className="upc-review-heading">
          <strong>UPC 核查</strong>
          <span>每次扫描后自动统计，确认入库前按这里复核件数和商品</span>
        </div>
        {reviewSummary.upcRows.length > 0 ? (
          reviewSummary.upcRows.map((row) => (
            <div className="upc-review-row" key={row.upc}>
              <span className="mono">{row.upc}</span>
              <span>{row.productName}</span>
              <strong>{row.count} 件</strong>
            </div>
          ))
        ) : (
          <div className="upc-review-empty">暂无可核查 UPC</div>
        )}
      </div>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={items.length}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
      />
      <table className="data-table">
        <thead>
          <tr>
            <th>物流单号</th>
            <th>UPC</th>
            <th>IMEI</th>
            <th>商品</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {paginatedItems.map((item) => {
            const isRemoving = removingItemId === item.id;
            const isUpdating = updatingItemId === item.id;
            const isEditing = editingItemId === item.id;
            const isBlockingException = blockingExceptionItemId === item.id;
            const canRemoveItem = canRemoveItems && item.status !== 'CONFIRMED';
            const canSaveEdit =
              !!editValues.upsTrackingNo.trim() && !!editValues.upc.trim() && !isUpdating;

            return (
              <tr
                key={item.id}
                ref={(element) => {
                  rowRefs.current[item.id] = element;
                }}
                className={
                  [
                    activeExceptionItemId === item.id ? 'active-exception-row' : '',
                    isBlockingException ? 'blocking-exception-row' : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
              >
                <td className="mono">
                  {isEditing ? (
                    <input
                      className="table-inline-input"
                      value={editValues.upsTrackingNo}
                      placeholder="UPS / USPS / FedEx / BB0000"
                      onChange={(event) => updateEditValue('upsTrackingNo', event.target.value)}
                    />
                  ) : (
                    (item.upsTrackingNo ?? '-')
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <input
                      className="table-inline-input"
                      value={editValues.upc}
                      onChange={(event) => updateEditValue('upc', event.target.value)}
                    />
                  ) : (
                    item.upc
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <input
                      className="table-inline-input"
                      value={editValues.imei}
                      placeholder="可留空"
                      onChange={(event) => updateEditValue('imei', event.target.value)}
                    />
                  ) : (
                    (item.imei ?? item.serial ?? '-')
                  )}
                </td>
                <td>
                  <strong>{item.product?.name ?? '-'}</strong>
                  {item.product?.modelCode ? <span>型号代码 {item.product.modelCode}</span> : null}
                </td>
                <td>
                  <span>{formatInboundItemStatus(item.status)}</span>
                  {item.status === 'EXCEPTION' ? (
                    <small>{formatInboundExceptionSummary(item)}</small>
                  ) : null}
                </td>
                <td>
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        className="table-action"
                        title="覆盖保存当前明细"
                        disabled={!canSaveEdit}
                        onClick={() => void saveEditingItem(item.id)}
                      >
                        <Check size={14} />
                        {isUpdating ? '保存中' : '保存'}
                      </button>
                      <button
                        type="button"
                        className="table-action secondary"
                        title="取消修正"
                        disabled={isUpdating}
                        onClick={() => setEditingItemId('')}
                      >
                        <X size={14} />
                        取消
                      </button>
                    </>
                  ) : item.status === 'EXCEPTION' ? (
                    <button
                      type="button"
                      className="table-action"
                      title="在当前行修正并覆盖原明细"
                      onClick={() => startEditingItem(item)}
                    >
                      <Pencil size={14} />
                      修正
                    </button>
                  ) : null}
                  {!isEditing && canRemoveItem ? (
                    <button
                      type="button"
                      className="table-action danger"
                      title="删除明细"
                      disabled={!!removingItemId || isEditing}
                      onClick={() => onRemoveItem(item.id)}
                    >
                      <Trash2 size={14} />
                      {isRemoving ? '删除中' : '删除'}
                    </button>
                  ) : item.status === 'EXCEPTION' ? null : (
                    '-'
                  )}
                </td>
              </tr>
            );
          })}
          {items.length === 0 ? (
            <tr>
              <td colSpan={6}>暂无明细</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  tone = 'default',
  disabled = false,
  onClick,
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning';
  disabled?: boolean;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        className={`summary-metric metric-button ${tone === 'warning' ? 'warning' : ''}`}
        disabled={disabled}
        onClick={onClick}
      >
        <span>{label}</span>
        <strong>{value}</strong>
      </button>
    );
  }

  return (
    <div className={`summary-metric ${tone === 'warning' ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LastInboundNotice({
  item,
  isUpdating,
  onUpdateItem,
}: {
  item: InboundDraftItem | null;
  isUpdating: boolean;
  onUpdateItem: (itemId: string, values: EditInboundItemValues) => Promise<unknown>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState<EditInboundItemValues>({
    upsTrackingNo: '',
    upc: '',
    imei: '',
  });

  useEffect(() => {
    setIsEditing(false);
    setValues({
      upsTrackingNo: item?.upsTrackingNo ?? '',
      upc: item?.upc ?? '',
      imei: item?.imei ?? item?.serial ?? '',
    });
  }, [item?.id, item?.upsTrackingNo, item?.upc, item?.imei, item?.serial]);

  if (!item) {
    return null;
  }

  const canEdit = item.status === 'PENDING' || item.status === 'EXCEPTION';
  const canSave = !!values.upsTrackingNo.trim() && !!values.upc.trim() && !isUpdating;
  const updateValue = (field: keyof EditInboundItemValues, value: string) => {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));
  };
  const cancelEdit = () => {
    setIsEditing(false);
    setValues({
      upsTrackingNo: item.upsTrackingNo ?? '',
      upc: item.upc,
      imei: item.imei ?? item.serial ?? '',
    });
  };
  const saveEdit = async () => {
    try {
      await onUpdateItem(item.id, values);
      setIsEditing(false);
    } catch {
      // Keep editing so the operator can fix the values and save again.
    }
  };

  return (
    <section
      className={`workflow-form last-inbound-form ${item.status === 'EXCEPTION' ? 'warning' : ''}`}
    >
      <label>
        <span>物流单号</span>
        <input
          className="mono"
          value={values.upsTrackingNo}
          placeholder="UPS / USPS / FedEx / BB0000"
          disabled={!isEditing || isUpdating}
          onChange={(event) => updateValue('upsTrackingNo', event.target.value)}
        />
      </label>
      <label>
        <span>UPC</span>
        <input
          value={values.upc}
          disabled={!isEditing || isUpdating}
          onChange={(event) => updateValue('upc', event.target.value)}
        />
      </label>
      <label>
        <span>IMEI</span>
        <input
          value={values.imei}
          disabled={!isEditing || isUpdating}
          onChange={(event) => updateValue('imei', event.target.value)}
        />
      </label>
      {item.status === 'EXCEPTION' ? (
        <div className="last-inbound-exception-message">
          <strong>异常</strong>
          <span>{formatInboundExceptionSummary(item)}</span>
        </div>
      ) : null}
      {isEditing ? (
        <>
          <button type="button" disabled={!canSave} onClick={() => void saveEdit()}>
            <Check size={16} />
            {isUpdating ? '保存中' : '保存'}
          </button>
          <button type="button" className="secondary" disabled={isUpdating} onClick={cancelEdit}>
            <X size={16} />
            取消
          </button>
        </>
      ) : (
        <button type="button" disabled={!canEdit || isUpdating} onClick={() => setIsEditing(true)}>
          <Pencil size={16} />
          编辑
        </button>
      )}
    </section>
  );
}

function buildInboundReviewSummary(draft: InboundDraft | null) {
  const items = sortInboundDraftItems(draft?.items ?? []);
  const trackingNumbers = new Set<string>();
  const productNames = new Set<string>();
  const upcRows = new Map<
    string,
    { upc: string; productName: string; count: number; firstScannedAt: number; firstIndex: number }
  >();

  for (const [index, item] of items.entries()) {
    if (item.upsTrackingNo) {
      trackingNumbers.add(item.upsTrackingNo);
    }

    const productName = item.product?.name ?? '未匹配商品';
    productNames.add(productName);
    const scannedAt = getInboundItemSortTime(item);

    const existing = upcRows.get(item.upc);
    if (existing) {
      existing.count += 1;
      existing.firstScannedAt = Math.min(existing.firstScannedAt, scannedAt);
      existing.firstIndex = Math.min(existing.firstIndex, index);
    } else {
      upcRows.set(item.upc, {
        upc: item.upc,
        productName,
        count: 1,
        firstScannedAt: scannedAt,
        firstIndex: index,
      });
    }
  }

  return {
    totalItems: draft?.summary.totalItems ?? items.length,
    upcCount: upcRows.size,
    productCount: productNames.size,
    trackingCount: trackingNumbers.size,
    upcRows: Array.from(upcRows.values()).sort(
      (left, right) =>
        left.firstScannedAt - right.firstScannedAt ||
        left.firstIndex - right.firstIndex ||
        left.upc.localeCompare(right.upc),
    ),
  };
}

function sortInboundDraftItems(items: InboundDraftItem[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        getInboundItemSortTime(left.item) - getInboundItemSortTime(right.item) ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}

function getInboundItemSortTime(item: InboundDraftItem) {
  const value = item.scannedAt ?? item.createdAt ?? item.updatedAt;
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function isLikelyCompleteTrackingInput(value: string) {
  const normalized = normalizeTrackingInput(value);
  if (!normalized) {
    return false;
  }
  if (/^1Z[0-9A-Z]{16}$/i.test(normalized)) {
    return true;
  }
  if (/^9622[0-9]{18,30}$/.test(normalized)) {
    return true;
  }
  if (/^BB0000[0-9A-Z]*$/.test(normalized)) {
    return true;
  }
  if (/^[0-9]{12}$/.test(normalized) || /^[0-9]{15}$/.test(normalized)) {
    return true;
  }
  if (/^[0-9]{20,34}$/.test(normalized)) {
    return true;
  }

  return normalized.length >= 8 && !upcLikeValue(normalized);
}

function upcLikeValue(value: string) {
  return /^[0-9]{8,14}$/.test(value);
}

function formatInboundItemStatus(status: string) {
  const labels: Record<string, string> = {
    PENDING: '待确认',
    CONFIRMED: '已入库',
    EXCEPTION: '异常',
    VOIDED: '已删除',
  };
  return labels[status] ?? status;
}

function formatInboundExceptionSummary(item: InboundDraftItem) {
  const openException = item.exceptions?.find((exception) => exception.status === 'OPEN');
  const exception = openException ?? item.exceptions?.[0];
  const type = exception?.type;
  const labels: Record<string, string> = {
    UPC_NOT_MATCHED: 'UPC 未匹配商品库',
    IMEI_DUPLICATED: 'IMEI/Serial 已存在库存',
    UPS_DUPLICATED: '物流单号已确认入库过',
    CUSTOMER_OWNERSHIP_MISMATCH: '客户归属不一致',
    IMEI_NOT_INBOUNDED: 'IMEI 未入库',
  };

  if (type) {
    return labels[type] ?? type;
  }
  if (!item.product) {
    return 'UPC 未匹配商品库';
  }
  return '请修正后再继续入库';
}

function normalizeTrackingInput(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function normalizeIdentityInput(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function findDraftIdentityDuplicate(items: InboundDraftItem[], value: string) {
  const normalized = normalizeIdentityInput(value);
  if (!normalized) {
    return null;
  }

  const duplicate = items.find((item) => {
    if (item.status === 'VOIDED') {
      return false;
    }

    return normalizeIdentityInput(item.imei ?? item.serial ?? '') === normalized;
  });

  return duplicate ? normalized : null;
}

function findDraftIdentityDuplicates(items: InboundDraftItem[]) {
  const counts = new Map<string, number>();

  for (const item of items) {
    if (item.status === 'VOIDED') {
      continue;
    }

    const identity = normalizeIdentityInput(item.imei ?? item.serial ?? '');
    if (!identity) {
      continue;
    }

    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }

  return [...counts.entries()].filter(([, count]) => count > 1).map(([identity]) => identity);
}

function buildTrackingWarningReasons(result: TrackingScanResult) {
  const reasons: string[] = [];
  if (!result.valid) {
    reasons.push('不是 UPS、BB0000 仓库补偿单号或 9622 开头的 22-34 位 FedEx 自动放行规则');
  }
  if (result.duplicate) {
    reasons.push(`该物流单号已有 ${result.duplicateCount} 条确认入库记录`);
  }
  if (result.currentDraftDuplicate) {
    reasons.push(`当前入库单已扫过该物流单号 ${result.currentDraftDuplicateCount ?? 1} 次`);
  }
  return reasons;
}

function isCurrentDraftDuplicateTrackingOnly(reasons: string[]) {
  return (
    reasons.length > 0 && reasons.every((reason) => reason.startsWith('当前入库单已扫过该物流单号'))
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
        customerAliasId:
          typeof parsed.customerAliasId === 'string' ? parsed.customerAliasId : undefined,
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

function parseInboundImportCsv(text: string): ImportInboundItemRow[] {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) {
    throw new Error('导入文件至少需要表头和一行入库明细');
  }

  const headers = rows[0]!.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, '').trim() : header.trim(),
  );
  const normalizedHeaders = headers.map((header) => inboundImportHeaderAliases[header]);
  const missingField = inboundImportRequiredFields.find(
    (field) => !normalizedHeaders.includes(field as keyof InboundImportRecord),
  );
  if (missingField) {
    throw new Error(`导入文件缺少表头：${toInboundImportHeaderLabel(missingField)}`);
  }
  const allowedFields = new Set([...inboundImportRequiredFields, ...inboundImportOptionalFields]);
  const unsupportedHeader = headers.find((header, index) => {
    const field = normalizedHeaders[index];
    return header && (!field || !allowedFields.has(field));
  });
  if (unsupportedHeader) {
    throw new Error(`导入文件包含不支持的表头：${unsupportedHeader}`);
  }

  return rows.slice(1).map((row, index) => {
    const record: InboundImportRecord = Object.fromEntries(
      normalizedHeaders
        .map((field, column) => [field, row[column] ?? ''])
        .filter(([field]) => field),
    );
    const lineNo = index + 2;
    const upc = (record.upc ?? '').trim();
    const imei = optionalText(record.imei);
    const serial = optionalText(record.serial);

    if (!upc) {
      throw new Error(`第 ${lineNo} 行缺少 UPC`);
    }
    if (imei && serial) {
      throw new Error(`第 ${lineNo} 行 IMEI 和 Serial 只能填写一个`);
    }

    return {
      upsTrackingNo: optionalText(record.trackingNo),
      upc,
      imei,
      serial,
    };
  });
}

type InboundImportRecord = {
  trackingNo?: string;
  upc?: string;
  imei?: string;
  serial?: string;
};

function toInboundImportHeaderLabel(field: string) {
  if (field === 'trackingNo') {
    return '单号';
  }
  return field;
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

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
