# Inbound Records APIs

## Scope

Phase eight powers the inbound records, batch customer-change selection, and detail-download pages.

Current controllers require `inbound.manage`.

## List Records

`GET /api/v1/inbound/records`

Query parameters:

- `page`, `pageSize`, `search`, `sortBy`, `sortOrder`
- `batchId`
- `customerId`
- `warehouseId`
- `status`
- `inventoryStatus`
- `upsTrackingNo`
- `upc`
- `imei`
- `serial`
- `dateFrom`
- `dateTo`

Supported `sortBy` values:

- `scannedAt`
- `createdAt`
- `updatedAt`
- `upc`
- `imei`
- `serial`
- `status`

Search covers UPS, UPC, IMEI, Serial, customer code/name, product SKU, and product name.

Exact filter fields are normalized before querying:

- UPS and Serial are trimmed and uppercased.
- UPC and IMEI are trimmed.
- Date filters apply to `scannedAt`.
- `inventoryStatus` filters linked `inventory_items.status` so the page can distinguish in-stock, packed, outbound, exception, and voided records.

Each row returns:

- Batch header and operator summary.
- Customer summary.
- Product summary when UPC matched.
- Linked `inventoryItemId`.
- `inventoryStatus`.
- `selectableForCustomerChange`, currently false only for voided inbound rows.
- Exception summaries.

## Get Record

`GET /api/v1/inbound/records/:id`

Returns one inbound item with batch, customer, product, linked inventory status, scan identifiers, timestamps, and exception summary.

Use this for the inbound-record detail drawer when the selected table row is an inbound item.

## Get Record Items

`GET /api/v1/inbound/records/:id/items`

In phase eight, `:id` is the inbound batch ID.

Query parameters:

- `page`
- `pageSize`
- `sortBy`
- `sortOrder`

Returns all inbound items under that batch with the same row shape as list records.

Use this for a detail page that opens from a batch header or grouped record view.

## Export Preview

`POST /api/v1/inbound/records/export-preview`

Request body uses the same filter fields as list records.

Example:

```json
{
  "customerId": "customer-1",
  "status": "CONFIRMED",
  "inventoryStatus": "IN_STOCK",
  "dateFrom": "2026-06-01T00:00:00.000Z",
  "dateTo": "2026-06-30T23:59:59.999Z"
}
```

Response:

```json
{
  "reportType": "inbound-records",
  "estimatedRowCount": 128,
  "filters": {
    "customerId": "customer-1",
    "status": "CONFIRMED",
    "inventoryStatus": "IN_STOCK",
    "dateFrom": "2026-06-01T00:00:00.000Z",
    "dateTo": "2026-06-30T23:59:59.999Z"
  },
  "reusableReportPayload": {
    "reportType": "inbound-records",
    "filters": {
      "customerId": "customer-1",
      "status": "CONFIRMED",
      "inventoryStatus": "IN_STOCK",
      "dateFrom": "2026-06-01T00:00:00.000Z",
      "dateTo": "2026-06-30T23:59:59.999Z"
    }
  }
}
```

The reports module can reuse `reusableReportPayload` later to create an asynchronous export job without the page rebuilding filter semantics.

## Permission Notes

The current backend gate is `inbound.manage`. Warehouse or customer data-scope permissions are not modeled yet; when they are added, apply that scope in `InboundService.normalizeRecordQuery` or a dedicated policy layer before calling `InboundRepository.findRecords`.
