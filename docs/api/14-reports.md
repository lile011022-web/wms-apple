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
  "fields": ["customerCode", "warehouseCode", "sku", "imei", "serial", "status"]
}
```

The response returns estimated row count, selected fields, available field whitelist, normalized filters, up to 10 formatted `sampleRows`, and whether the export should run as a background job. The frontend uses `sampleRows` to show a partial table before creating the export.

`filters.dateFrom` and `filters.dateTo` are optional ISO datetimes. They filter the report's primary business time: inbound `scannedAt`, outbound `packedAt`, inventory `receivedAt`, exception `createdAt`, customer-change log `createdAt`, and audit log `createdAt`.

For inbound detail downloads, pass `filters.batchId` to download one confirmed inbound batch. When a batch is selected, generated files use the batch number in the file name, for example `inbound_detail-INB-20260622-001-export_01H.csv`.

## Inbound Batch Options

`GET /reports/inbound-batches`

Query parameters:

- `customerId`: optional customer filter.
- `search`: optional batch number, customer code, or customer name search.
- standard pagination.

Returns confirmed inbound batches for the detail-download batch selector. Each row includes `id`, `batchNo`, `label`, customer, warehouse, item count, and confirmation time.

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

For sealed packing detail downloads, use `reportType = OUTBOUND_DETAIL` with `filters.outboundStatus = SEALED`. Search supports box number, customer, UPC, tracking number, IMEI, Serial, SKU, and product name. Include `boxNotes` when the download needs each box's remark.

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
