# Outbound Packing API

Outbound packing endpoints power the outbound packing page and reuse customer-owned inventory from the inventory module.

All endpoints use the `/api/v1` prefix and require bearer authentication with `outbound.manage`.

## POST /outbound/boxes

Creates an open outbound box for one customer in one warehouse.

Request body:

```json
{
  "customerId": "customer-1",
  "warehouseId": "warehouse-1",
  "boxName": "Customer A first box",
  "sizePreset": "12*12*12",
  "customSize": null,
  "weightLb": 45,
  "notes": "Packing lane A"
}
```

Rules:

- `customerId` is required.
- `warehouseId` is required.
- Customer must be active.
- Warehouse must be active.
- If `boxNo` is omitted, the backend generates a deterministic customer-linked box number: `BOX-{CUSTOMER_CODE}-{YYYYMMDD}-{SEQUENCE}`.
- Example generated box number: `BOX-BB0001-20260618-001`.
- The generated `SEQUENCE` increments from the latest box number with the same customer/date prefix inside the warehouse.
- Generated box numbers do not use random suffixes.
- A provided `boxNo` is uppercased and must still be unique inside the warehouse.
- `sizePreset` supports `12*12*12`, `14*14*14`, and `CUSTOM`.
- `customSize` is required when `sizePreset` is `CUSTOM`.
- `weightLb` defaults to `45` and is stored in pounds.
- Box creation writes an `OUTBOUND_BOX_CREATE` audit log.

## PATCH /outbound/boxes/:id

Updates editable box settings before packing or while the box is open for rework.

Request body:

```json
{
  "boxName": "Customer A rework box",
  "sizePreset": "CUSTOM",
  "customSize": "16*14*12",
  "weightLb": 42.5,
  "notes": "Customer requested repack"
}
```

Rules:

- The box must be `OPEN`.
- Only submitted fields are changed.
- Updating box settings writes an `OUTBOUND_BOX_UPDATE` audit log.

## GET /outbound/boxes

Lists outbound boxes. For performance, list rows return customer, warehouse, creator, `itemCount`, and an empty `items` array instead of loading every packed row in every box.

Query parameters:

- `customerId`: optional.
- `warehouseId`: optional.
- `status`: optional `OPEN`, `SEALED`, or `VOIDED`.
- `search`: optional box number, customer code, or customer name search.
- `page`, `pageSize`, `sortBy`, `sortOrder`: standard pagination and sorting.

Allowed sort fields:

- `createdAt`
- `updatedAt`
- `boxNo`
- `sealedAt`
- `status`

## GET /outbound/boxes/:id

Returns one outbound box with customer, warehouse, creator, item count, and packed inventory rows.

Each item contains the outbound box item ID, inventory item ID, UPC, UPS, IMEI, Serial, inventory status, received time, packed time, and product block.

## GET /outbound/boxes/:id/items

Returns packed inventory rows in one outbound box with backend pagination.

Query parameters:

- `page`: optional, defaults to `1`.
- `pageSize`: optional, defaults to the shared pagination default.
- `search`: optional search across tracking number, UPC, IMEI, Serial, SKU, and product name.

Use this endpoint when the current-box detail area or export preview needs many rows without loading the entire box in one response.

## GET /outbound/available-items

Returns inventory rows available for outbound packing.

Query parameters:

- `customerId`: required.
- `warehouseId`: optional.
- `search`: optional search across UPS, UPC, IMEI, Serial, SKU, and product name.
- `upc`, `imei`, `serial`, `upsTrackingNo`: optional field filters.
- `page`, `pageSize`, `sortBy`, `sortOrder`: standard inventory pagination and sorting.

The backend delegates to `GET /inventory/available-for-outbound`, forces `status = IN_STOCK`, and requires the selected customer.

## POST /outbound/boxes/:id/items

Adds one inventory item to an open outbound box.

Request body:

```json
{
  "inventoryItemId": "inventory-1"
}
```

Rules:

- The box must be `OPEN`.
- The inventory item must exist.
- The inventory item must belong to the same customer as the box.
- The inventory item must belong to the same warehouse as the box.
- The inventory item status must be `IN_STOCK`.
- The inventory item must not already be packed in any outbound box.
- On success, the inventory item status becomes `PACKED`.
- Adding an item writes an `OUTBOUND_BOX_ITEM_ADD` audit log.

The outbound packing page can batch-pack by calling this endpoint once per selected available inventory row from `GET /outbound/available-items`. Batch packing remains a frontend orchestration over the same single-item API so customer ownership, warehouse ownership, duplicate packing, status, and audit checks stay centralized.

## DELETE /outbound/boxes/:id/items/:itemId

Removes one item from an open outbound box.

`itemId` may be either the outbound box item ID or the inventory item ID.

Rules:

- The box must be `OPEN`.
- The item must belong to the box.
- On success, the inventory item status returns to `IN_STOCK` and `packedAt` is cleared.
- Removing an item writes an `OUTBOUND_BOX_ITEM_REMOVE` audit log.

## DELETE /outbound/boxes/:id/items

Clears all items from an open outbound box.

Rules:

- The box must be `OPEN`.
- All packed inventory rows in the box return to `IN_STOCK`.
- The response includes `clearedCount` and the current empty box.
- Clearing the box writes an `OUTBOUND_BOX_ITEM_CLEAR` audit log.

## POST /outbound/boxes/:id/seal

Seals an open outbound box.

Rules:

- The box must be `OPEN`.
- The box must contain at least one item.
- Sealing runs inside a database transaction.
- The backend marks the box `SEALED`, sets `sealedAt`, ensures all box inventory rows are `PACKED`, and writes an `OUTBOUND_BOX_SEAL` audit log.

## POST /outbound/boxes/:id/reopen

Reopens a sealed box for warehouse rework.

Rules:

- The box must be `SEALED`.
- The box status returns to `OPEN`.
- `sealedAt` is cleared.
- Box items remain linked to the same box and inventory remains `PACKED` until an operator removes an item.
- Reopening writes an `OUTBOUND_BOX_REOPEN` audit log.

## DELETE /outbound/boxes/:id

Voids an open or rework outbound box.

Rules:

- The box must not be `SEALED`.
- Sealed boxes must be reopened for rework before deletion.
- Deletion is a safe void operation, not a physical database delete.
- Packed inventory rows in the deleted box return to `IN_STOCK`.
- Deletion writes an `OUTBOUND_BOX_DELETE` audit log.

## Response Shape

Outbound box responses use this shape:

```json
{
  "id": "box-1",
  "boxNo": "BOX-20260617-001",
  "boxName": "Customer A first box",
  "sizePreset": "12*12*12",
  "customSize": null,
  "weightLb": 45,
  "status": "OPEN",
  "customer": {
    "id": "customer-1",
    "code": "CUST-001",
    "name": "Apple Reseller"
  },
  "warehouse": {
    "id": "warehouse-1",
    "code": "US-LAX-01",
    "name": "US Los Angeles Warehouse"
  },
  "createdBy": {
    "id": "user-1",
    "email": "operator@wms-scan.local",
    "name": "Outbound Operator"
  },
  "itemCount": 1,
  "items": [
    {
      "id": "box-item-1",
      "inventoryItemId": "inventory-1",
      "packedAt": "2026-06-17T00:00:00.000Z",
      "inventoryItem": {
        "id": "inventory-1",
        "upc": "194253149189",
        "upsTrackingNo": "1Z999AA10123456784",
        "imei": "356789012345678",
        "serial": null,
        "status": "PACKED"
      }
    }
  ],
  "notes": null,
  "sealedAt": null,
  "createdAt": "2026-06-17T00:00:00.000Z",
  "updatedAt": "2026-06-17T00:00:00.000Z"
}
```

## Permission Notes

The current gate is `outbound.manage`. Future customer or warehouse data-scope rules should be applied before box creation, available inventory lookup, and box mutation.
