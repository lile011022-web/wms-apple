# Inventory API

Inventory endpoints power the customer inventory page, outbound packing inventory selection, detail download filters, and dashboard inventory totals. The customer inventory page now combines `customer-summary`, `products`, and `items` so operators can review totals, SKU-level counts, and item-level tracking numbers in one workflow. It can also call the outbound box APIs to create an open box, add selected available inventory rows, and seal the box without leaving the customer inventory page.

All endpoints use the `/api/v1` prefix and require bearer authentication with `inventory.read`.

## GET /inventory/customer-summary

Returns customer-level inventory totals.

Query parameters:

- `customerId`: required. The customer whose inventory should be counted.
- `warehouseId`: optional warehouse filter.

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
      }
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

## GET /inventory/items

Returns item-level inventory rows.

Query parameters:

- `customerId`: optional for general inventory search, required by customer-facing pages.
- `warehouseId`: optional.
- `productId`: optional.
- `status`: optional `IN_STOCK`, `PACKED`, `OUTBOUND`, `EXCEPTION`, or `VOIDED`.
- `upc`, `imei`, `serial`, `upsTrackingNo`: optional exact-field contains filters.
- `search`: optional search across UPC, IMEI, Serial, UPS, SKU, and product name.
- `availableForOutbound`: optional boolean. When true, only `IN_STOCK` rows are returned.
- `page`, `pageSize`, `sortBy`, `sortOrder`: standard pagination and sorting.

Allowed sort fields:

- `receivedAt`
- `updatedAt`
- `upc`
- `imei`
- `serial`
- `status`

Rows include customer, warehouse, product, inbound batch, inbound item, latest outbound box, exception summary, and timestamps.

Customer inventory item tables should display the returned tracking context:

- `inboundBatch.batchNo`: inbound batch number.
- `upsTrackingNo`: package tracking/order number captured during inbound scan or CSV import.
- `latestOutboundBox.boxNo`: outbound box/order number when the inventory row has been packed or shipped.

Customer inventory batch packing must use only rows where `availableForOutbound = true`. The frontend creates or selects an open outbound box through `/outbound/boxes`, adds each selected row through `POST /outbound/boxes/:id/items`, and seals through `POST /outbound/boxes/:id/seal`. Customer, warehouse, duplicate-packing, status, and audit rules remain owned by the outbound module.

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

The current gate is `inventory.read`. Customer or warehouse data-scope permissions are not modeled yet; when they are added, apply them in `InventoryService.normalizeItemQuery` or a dedicated policy layer before repository queries.
