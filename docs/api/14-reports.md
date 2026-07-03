# Report Export APIs

Phase thirteen adds detail-download and report-export workflows.

Base path: `/api/v1/reports`

Permission: `reports.export`

## Report Types

- `INBOUND_DETAIL`: inbound item detail.
- `OUTBOUND_DETAIL`: outbound packing detail. Set `filters.outboundStatus = "SEALED"` to download only sealed box detail.
- `INVENTORY_DETAIL`: current inventory item detail.
- `EXCEPTION_DETAIL`: exception record detail.
- `CUSTOMER_CHANGE_LOG`: customer correction logs.
- `AUDIT_LOG`: operation audit logs.

## Preview

`POST /reports/preview`

```json
{
  "reportType": "INVENTORY_DETAIL",
  "filters": {
    "customerId": "customer-1",
    "warehouseId": "warehouse-1",
    "inventoryStatus": "IN_STOCK",
    "dateFrom": "2026-06-01T00:00:00.000Z",
    "dateTo": "2026-06-30T23:59:59.999Z"
  },
  "fields": ["upsTrackingNo", "receivedAt", "upc", "imei", "productName", "quantity"]
}
```

The response returns estimated row count, selected fields, available field whitelist, normalized filters, up to 10 formatted `sampleRows`, and whether the export should run as a background job. The frontend uses `sampleRows` to show a partial table before creating the export.

`INVENTORY_DETAIL` uses the operator-facing fixed columns `单号`, `入库时间`, `UPC`, `IMEI`,
`商品名称`, and `数量`. The API field keys are `upsTrackingNo`, `receivedAt`, `upc`, `imei`,
`productName`, and `quantity`.
Inventory detail preview and export group rows by `单号 + UPC + 商品名称`, then sum `quantity`.
The same UPC is accumulated only when it belongs to the same package tracking number. If the same
UPC appears under different package tracking numbers, those rows stay separate. If one group has
quantity greater than one or multiple IMEI/Serial values, the export writes a summary row first,
then writes one indented-style detail row per IMEI with only the `IMEI` column populated. This keeps
the quantity merged while still making each device identity easy to review. Current item-level
inventory rows do not store a separate quantity column, so each raw item contributes one unit unless
a quantity value is present on the report row.

When the customer inventory page needs a table-shaped detail export, it passes explicit fields such
as `customerCode`, `customerName`, `inboundBatchNo`, `outboundBoxNo`, `modelCode`, `receivedAt`,
and `status`. In that mode, `INVENTORY_DETAIL` keeps item-level rows instead of the
default grouped quantity summary, so the downloaded file matches the visible inventory detail table.

When `reportType = INVENTORY_DETAIL`, `format = EXCEL`, and `exportLayout = "WAREHOUSE_HOLD"`, the
export generates a `留仓汇总` workbook layout for unsealed hold review. The frontend pairs this
layout with `filters.inventoryStatus = "PACKED"` and `filters.outboundStatus = "OPEN"` so the
workbook contains only items already added to boxes that are not sealed yet. The workbook auto-groups
the selected inventory rows into virtual
`留仓箱1`, `留仓箱2`, ... buckets with 24 devices per box, then uses the same left detail and right
UPC/model summary structure as the packed-summary layout.

When `reportType = INBOUND_DETAIL`, `format = EXCEL`, and
`exportLayout = "INBOUND_REGISTRATION"`, the export ignores the selected-field table shape and
generates a fixed registration worksheet with headers `入库时间`, `单号`, `UPC`, `IMEI`, `商品名称`,
and `数量`. Use this when the customer-facing or Feishu registration table needs the compact
six-column layout.

`filters.dateFrom` and `filters.dateTo` are optional ISO datetimes. They filter the report's primary business time: inbound `scannedAt`, outbound `packedAt`, inventory `receivedAt`, exception `createdAt`, customer-change log `createdAt`, and audit log `createdAt`.

For inbound detail downloads, pass `filters.batchId` to download one confirmed inbound batch.
Pass `filters.inboundStatus` to limit rows by inbound item status. The detail-download page
defaults this to `CONFIRMED` so customer-facing downloads do not mix in `PENDING`, `EXCEPTION`,
or `VOIDED` rows unless the operator intentionally selects another status or all statuses. When a
batch is selected, generated files use the batch number in the file name, for example
`inbound_detail-INB-20260622-001-export_01H.csv`.

## Inbound Batch Options

`GET /reports/inbound-batches`

Query parameters:

- `customerId`: optional customer filter.
- `search`: optional batch number, customer code, or customer name search.
- standard pagination.

Returns confirmed inbound batches for the detail-download batch selector. Each row includes `id`, `batchNo`, `label`, customer, warehouse, item count, and confirmation time.

## Outbound Box Options

`GET /reports/outbound-boxes`

Query parameters:

- `customerId`: optional customer filter. Omit it for all-customer box selection.
- `warehouseId`: optional warehouse filter.
- `outboundStatus`: optional box status filter. The detail-download page sends `SEALED` for `仅已封箱` and omits it for `全部装箱明细`.
- `sizePreset`: optional box type/size filter, for example `12*12*12`, `16*16*12`, `18*18*12`, `18*18*16`, or `CUSTOM`.
- `dateFrom` and `dateTo`: optional ISO datetimes. They only return boxes with packed rows inside the selected time range.
- `search`: optional box number/name, uploaded shipment number, customer code/name, UPC, tracking number, IMEI, Serial, SKU, or product-name search.
- standard pagination.

Returns candidate outbound boxes for the 装箱明细 selector. Each row includes `boxNo`, `boxName`,
`sizePreset`, `customSize`, `shippingTrackingNo`, status, customer, warehouse, `itemCount`, created time, and sealed time. The
selector is read-only; actual preview/export still uses `POST /reports/preview` and
`POST /reports/exports` with `filters.boxNos`.

## Create Export

`POST /reports/exports`

```json
{
  "reportType": "OUTBOUND_DETAIL",
  "format": "CSV",
  "filters": {
    "customerId": "customer-1",
    "outboundStatus": "SEALED"
  },
  "fields": [
    "boxNo",
    "boxName",
    "boxNotes",
    "customerName",
    "sku",
    "productName",
    "upc",
    "upsTrackingNo",
    "imei",
    "serial",
    "sealedAt"
  ]
}
```

Supported formats:

- `CSV`
- `EXCEL`

The current implementation completes small exports synchronously. Reports over the configured synchronous row limit are rejected for background-job handling. A successful export writes an `AuditLog` with action `REPORT_EXPORT`.

For sealed packing detail downloads, use `reportType = OUTBOUND_DETAIL` with `filters.outboundStatus = SEALED`. Search supports box number, customer, UPC, tracking number, IMEI, Serial, SKU, and product name. Include `boxNotes` when the download needs each box's remark, and include `shippingTrackingNo` when the download needs the uploaded outbound shipment or label number.

The detail-download page can pass `filters.boxNos` to preview or export exact selected boxes. These
box numbers combine with customer, date, search, and status filters. If operators want the full
contents of selected boxes, they should leave `dateFrom` and `dateTo` empty.

For customer-service order creation before warehouse sealing, the outbound packing page can create an
`OUTBOUND_DETAIL` Excel export with selected customer/warehouse filters, optionally narrowed by
`filters.boxNo` for one box or `filters.boxNos` for multiple selected boxes, and no
`filters.outboundStatus`. This returns open or sealed packing rows and does not bypass the later
sealing evidence rule.

When `reportType = OUTBOUND_DETAIL` and `format = EXCEL`, the generated workbook follows the customer reconciliation layout used for outbound packing:

- `出库信息`: outbound identifier, ownership customer, a blank actual-delivery-address placeholder, date, total quantity, and whole-export UPC/model totals.
- `SN&IMEI`: box-by-box item detail with each box's uploaded outbound shipment or label number, sequence number, each item's package/order number, UPC, Serial as `SN`, and IMEI.
- `各箱型号汇总`: UPC/model totals inside each box.
- `出库详情`: actual scanned outbound summary with box count, total count, and UPC/model totals.

This outbound Excel layout is fixed so it can match customer-facing packing detail sheets. Labels use `归属客户` and `实际送到地址`, and the workbook data cells are centered for a consistent handoff format. The selected `fields` list still controls preview and CSV exports, but outbound Excel exports use the complete row data needed to build the four-sheet workbook.

Outbound detail Excel exports can also pass `exportLayout = "PACKED_SUMMARY"` to generate the
already-packed summary layout. This alternate workbook keeps the same `OUTBOUND_DETAIL` data source
and filters, but outputs one `已装箱汇总` sheet:

- left table: `箱数`, `upc`, `型号`, `imei`, with one row per packed device and merged box/UPC labels.
- right table: `箱数 + UPC + 型号` grouped counts, plus a green `总数` row.

When `exportLayout` is omitted or set to `STANDARD`, the existing four-sheet customer reconciliation
workbook is generated.

To re-download with the same report type, filters, fields, and format, call the same endpoint with:

```json
{
  "reportType": "INVENTORY_DETAIL",
  "format": "CSV",
  "sourceExportId": "export-1"
}
```

## Export History

`GET /reports/exports`

Query parameters:

- `reportType`
- `status`
- standard pagination and sorting

Only exports requested by the current user are returned.

## Export Detail

`GET /reports/exports/:id`

Returns status, report type, selected fields, format, row count, file name, file URL, expiration time, and error message.

## Download

`GET /reports/exports/:id/download`

Only the requester can download an export. Only `COMPLETED` exports can be downloaded.

The JSON response includes:

- `fileName`
- `contentType`
- `rowCount`
- `content`
- `expiresAt`

The frontend should write `content` to a downloaded file using the returned file name and content type.
In the browser UI, this means the generated file is saved by the browser to the user's configured download location, usually the system Downloads folder unless the browser asks for a location.
