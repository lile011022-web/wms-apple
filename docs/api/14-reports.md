# Report Export APIs

Phase thirteen adds detail-download and report-export workflows.

Base path: `/api/v1/reports`

Permission: `reports.export`

## Report Types

- `INBOUND_DETAIL`: inbound item detail.
- `OUTBOUND_DETAIL`: outbound packed item detail.
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

The response returns estimated row count, selected fields, available field whitelist, normalized filters, and whether the export should run as a background job.

## Create Export

`POST /reports/exports`

```json
{
  "reportType": "INVENTORY_DETAIL",
  "format": "CSV",
  "filters": {
    "customerId": "customer-1"
  },
  "fields": ["imei", "serial", "status"]
}
```

Supported formats:

- `CSV`
- `EXCEL`

The current implementation completes small exports synchronously. Reports over the configured synchronous row limit are rejected for background-job handling. A successful export writes an `AuditLog` with action `REPORT_EXPORT`.

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
