import type { SystemSettings, Warehouse } from '../api/settings';

export function selectDefaultWarehouseId(
  warehouses: Warehouse[],
  settings?: SystemSettings | null,
) {
  const defaultWarehouseId = settings?.warehouse.defaultWarehouseId;
  const defaultWarehouse = warehouses.find(
    (warehouse) => warehouse.id === defaultWarehouseId && warehouse.isActive,
  );

  return defaultWarehouse?.id ?? warehouses.find((warehouse) => warehouse.isActive)?.id ?? '';
}
