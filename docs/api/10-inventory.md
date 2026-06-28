# Inventory API

Inventory endpoints power the customer inventory page, outbound packing inventory selection, detail download filters, and dashboard inventory totals. The customer inventory page combines `customer-summary`, `products`, and `items` so operators can review totals, SKU-level counts, SKU-related package tracking number counts, and item-level tracking numbers in one workflow. Box creation, batch packing, and sealing belong to the outbound packing page and outbound APIs.

All endpoints use the `/api/v1` prefix and require bearer authentication with `inventory.read`.

## GET /inventory/customer-summary

Returns customer-level inventory totals.

Query parameters:

- `customerId`: required. The customer whose inventory should be counted.
- `warehouseId`: optional warehouse filter.
- `status`: optional inventory status for a drill-down summary.
- `dateFrom`, `dateTo`: optional business date range. Date-only values such as `2026-06-28` are expanded to the full UTC day.

Date filters are status-aware. `PACKED` uses `packedAt`, `OUTBOUND` uses `outboundAt`, and other inventory states use `receivedAt`. Without a status filter, the API combines those status-specific date anchors so daily packed and outbound counts match the action date.

Response data:

```json
{
  "customerId": "customer-1",
  "warehouseId": null,
  "totalQuantity": 6,
  "skuCount": 2,
  "inStockQuantity": 3,
  "packedQuantity": 0,
  "outboundQuantity": 2,
  "exceptionQuantity": 1,
  "voidedQuantity": 0,
  "availableForOutboundQuantity": 3
}
```

`availableForOutboundQuantity` is equal to `IN_STOCK` inventory. `EXCEPTION`, `PACKED`, `OUTBOUND`, and `VOIDED` inventory must not be directly packed.

## GET /inventory/products

Returns SKU-level inventory summaries for a selected customer.

Query parameters:

- `customerId`: required.
- `warehouseId`: optional.
- `search`: optional UPC, SKU, product name, IMEI, Serial, or UPS search.
- `status`: optional `IN_STOCK`, `PACKED`, `OUTBOUND`, `EXCEPTION`, or `VOIDED` status filter.
- `dateFrom`, `dateTo`: optional business date range using the same status-aware date anchors as `GET /inventory/customer-summary`.
- `page`, `pageSize`, `sortBy`, `sortOrder`: standard pagination and sorting.

Allowed sort fields:

- `sku`
- `name`
- `createdAt`
- `updatedAt`

Each row contains a product block and status counts:

```json
{
  "items": [
    {
      "product": {
        "id": "product-1",
        "sku": "IPHONE-16-PRO-256-NAT",
        "brand": "Apple",
        "name": "iPhone 16 Pro 256GB Natural Titanium",
        "model": "iPhone 16 Pro",
        "category": "iPhone",
        "color": "Natural Titanium",
        "capacity": "256GB",
        "requiresImei": true,
        "status": "ACTIVE",
        "upcs": ["194253149189"]
      },
      "summary": {
        "totalQuantity": 5,
        "inStockQuantity": 3,
        "packedQuantity": 0,
        "outboundQuantity": 2,
        "exceptionQuantity": 0,
        "voidedQuantity": 0,
        "availableForOutboundQuantity": 3
      },
      "trackingNumberCount": 2
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

## GET /inventory/products/:productId/items

Expands one product into item-level IMEI or Serial inventory rows.

Use the same query parameters as `GET /inventory/items`. The route validates that the product exists before listing rows.

## DELETE /inventory/products

Deletes inventory for one or more SKU/product rows in the customer inventory page.

Permission: `customers.manage`

Request body:

```json
{
  "customerId": "customer-1",
  "warehouseId": "warehouse-1",
  "productIds": ["product-1", "product-2"]
}
```

The backend deletes inventory rows matching the selected customer, optional warehouse, and selected
products. Before deleting the inventory rows, it removes related outbound box item rows and clears
linked `inbound_items.inventoryItemId` and `exception_records.inventoryItemId` values so foreign keys
do not block the cleanup. The customer record, product catalog, inbound batch, and inbound item rows
remain in place for historical review. The operation writes an audit log with the deleted item count.

## GET /inventory/items

Returns item-level inventory rows.

Query parameters:

- `customerId`: optional for general inventory search, required by customer-facing pages.
- `warehouseId`: optional.
- `productId`: optional.
- `status`: optional `IN_STOCK`, `PACKED`, `OUTBOUND`, `EXCEPTION`, or `VOIDED`.
- `upc`, `imei`, `serial`, `upsTrackingNo`: optional exact-field contains filters.
- `search`: optional search across UPC, IMEI, Serial, UPS, inbound batch number, outbound box
  number/name, SKU, and product name.
- `availableForOutbound`: optional boolean. When true, only `IN_STOCK` rows are returned.
- `dateFrom`, `dateTo`: optional business date range using status-aware date anchors. Packed rows are filtered by `packedAt`, outbound rows by `outboundAt`, and other rows by `receivedAt`.
- `page`, `pageSize`, `sortBy`, `sortOrder`: standard pagination and sorting.

Allowed sort fields:

- `receivedAt`
- `updatedAt`
- `upc`
- `imei`
- `serial`
- `status`

Rows include customer, warehouse, product, inbound batch, inbound item, latest outbound box, exception summary, and timestamps.

Customer inventory IMEI detail rows should show both time anchors:

- `inboundItem.scannedAt`: scan time from the original inbound detail row.
- `receivedAt`: inventory inbound time, created when the item became inventory.

Customer inventory item tables should display the returned tracking context and expose the `search`
filter in the IMEI detail section:

- `inboundBatch.batchNo`: inbound batch number.
- `upsTrackingNo`: package tracking/order number captured during inbound scan or CSV import.
- `latestOutboundBox.boxNo`: internal outbound box/order number when the inventory row has been packed or shipped.
- `latestOutboundBox.boxName`: operator-facing generated box name, used by outbound packing search to tell staff which box already contains the item.

The left navigation customer inventory page does not create boxes, seal boxes, or pack inventory. It
may delete selected SKU inventory for operational cleanup through `DELETE /inventory/products`.
Batch packing must use `GET /inventory/available-for-outbound` from the outbound packing page, then
add selected rows through `POST /outbound/boxes/:id/items`. The outbound packing page may call
`GET /inventory/items` when an operator searches a specific value so packed rows can be found and
their `latestOutboundBox` context can be shown, but only rows with `availableForOutbound = true` may
be added to a box. Customer, warehouse, duplicate-packing, status, and audit rules remain owned by
the outbound module.

## GET /inventory/items/:id

Returns one inventory row by ID. Use this for item detail drawers or audit drill-down links.

## GET /inventory/available-for-outbound

Returns inventory rows that can be selected by outbound packing.

Query parameters:

- `customerId`: required.
- All other item filters from `GET /inventory/items` are supported.

The response shape matches `GET /inventory/items`. The backend forces `status = IN_STOCK` and `availableForOutbound = true`, so exception and already packed or outbound inventory are excluded.

## GET /inventory/export-preview

Returns the estimated row count and reusable report payload for inventory exports. This does not create a file; the reports module can later create jobs using the same filter semantics.

```json
{
  "reportType": "inventory-items",
  "estimatedRowCount": 128,
  "filters": {
    "customerId": "customer-1",
    "status": "IN_STOCK"
  },
  "reusableReportPayload": {
    "reportType": "inventory-items",
    "filters": {
      "customerId": "customer-1",
      "status": "IN_STOCK"
    }
  }
}
```

## Permission Notes

Read endpoints use `inventory.read`. SKU inventory deletion uses `customers.manage` because it is a
destructive customer-owned data cleanup action. Customer or warehouse data-scope permissions are not
modeled yet; when they are added, apply them in `InventoryService.normalizeItemQuery` or a dedicated
policy layer before repository queries.
