# Package Prealerts API

All endpoints use `/api/v1` and require bearer authentication.

## Purpose

Package prealerts record customer-provided tracking numbers before inbound receiving. They allow the inbound scan page to identify the customer from the package tracking number, show ETA and delivery status, and alert operators when delivered packages have not been received into WMS inventory.

Prealert records are not inventory. Inventory is created only by the existing inbound confirmation workflow.

ETA and delivered time are logistics-query outputs. Operators should not need to manually provide ETA during prealert creation.

## Permissions

- `package-prealerts.read`: list prealerts, alerts, summaries, and inbound matching results.
- `package-prealerts.manage`: create prealerts, update package logistics status, and handle alerts.

## GET /package-prealerts/summary

Returns operational counters for the package prealert dashboard area.

Response fields:

- `totalOpen`: prealert packages not yet received.
- `todayExpected`: packages with ETA today and not yet received.
- `deliveredNotReceived`: open delivered-not-received alerts.
- `etaOverdue`: open ETA-overdue alerts.
- `criticalAlerts`: open critical alerts.
- `nextArrivals`: next packages sorted by ETA.

## GET /package-prealerts

Lists package prealert items.

Query parameters:

- `page`, `pageSize`, `search`, `sortBy`, `sortOrder`.
- `customerId`.
- `logisticsStatus`: `UNKNOWN`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `EXCEPTION`.
- `receivingStatus`: `NOT_RECEIVED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `VOIDED`.

Rows include customer, prealert batch, tracking number, carrier, ETA, delivered time, receiving status, open alerts, recent tracking events, and exchange fields.

Exchange fields:

- `exchangePushStatus`: `PENDING`, `PUSHED`, `FAILED`, or `SKIPPED`.
- `exchangeRecordId`: external sheet record marker after a successful push.
- `exchangePushedAt`: last successful push time.
- `exchangePulledAt`: last warehouse-return pull time.
- `exchangeSyncError`: last sync error, if any.

The prealert page uses `page` and `pageSize` for visible pagination. Changing search filters should reset the page to 1 on the frontend.

## GET /package-prealerts/match

Checks whether a tracking number has a unique valid prealert customer.

Query parameters:

- `trackingNo`: package tracking number scanned by the operator.

Response behavior:

- If no prealert exists, returns `matched: false` and `reason: NOT_FOUND`.
- If multiple active customers are tied to the same tracking number, returns `matched: false` and `reason: CUSTOMER_CONFLICT`.
- If a unique active customer is found, returns `matched: true`, `customer`, and `prealert`.

The inbound scan page uses this endpoint to auto-select the customer before the operator locks the inbound draft.

## POST /package-prealerts

Creates one prealert batch for one customer.

Request shape:

```json
{
  "customerId": "cust_01H...",
  "source": "MANUAL",
  "notes": "BB-DE-252-2",
  "items": [
    {
      "trackingNo": "1Z999AA10123456784",
      "trackingLink": "https://www.ups.com/track?tracknum=1Z999AA10123456784",
      "productModel": "iPhone 17 256GB Black",
      "recipientName": "Patricia M",
      "notes": "BB-DE-252-2"
    }
  ]
}
```

Rules:

- Each row must provide either `trackingNo` or a parseable `trackingLink`.
- Common UPS, USPS, and FedEx link parameters are parsed when possible.
- Apple order links such as `/vieworder/W.../...` are saved as order references first. They are not carrier tracking numbers until a future sync adapter queries Apple order status and writes the real carrier tracking number, ETA, and delivery status.
- For Apple order links, the future sync adapter must load the order page and click the `trackingNumber` field or equivalent tracking entry. The real carrier tracking number may appear only after that click, either through a carrier-page redirect or an expanded Apple tracking detail panel.
- The current WMS UI labels `notes` as `仓库` on the prealert form. Excel imports store each row's `预报仓库` or `仓库` value in item `notes`, so Google Sheets push can write it to the `仓库` column.
- Excel imports can store each row's `型号` in `productModel` and `姓名` or `名字` in `recipientName`. These fields are optional and are used only for the Google Sheets prealert handoff.
- Same-customer duplicate prealerts create a duplicate alert.
- Different-customer duplicates create a customer-conflict alert and must not be used for silent customer locking.

## Excel Batch Import Template

The package prealert page can read `.xlsx`, `.xls`, or `.csv` files locally in the browser and submit the parsed rows through `POST /package-prealerts`.

Supported first-row headers:

- `预报仓库` or `仓库`: optional warehouse code. The UI stores this as item `notes` and displays it as warehouse.
- `单号`: optional package tracking number or order reference.
- `超链接`: optional Apple order link or carrier tracking link.
- `型号`: optional product model. WMS stores it as `productModel` and can push it to the Google Sheet `型号` column.
- `姓名` or `名字`: optional recipient/name reference. WMS stores it as `recipientName` and can push it to the Google Sheet `姓名` column.
- `邮箱`: accepted in the template for operator reference, but not currently stored by WMS.

Each imported row must provide either `单号` or `超链接`. Empty rows are skipped. One import is capped at 5000 effective rows. The browser submits large imports to `POST /package-prealerts` in 500-row chunks.

## PATCH /package-prealerts/:id/status

Manually updates package logistics status for the MVP. Future external carrier or tracking-system sync should write through the same status fields.

Request fields:

- `logisticsStatus`.
- `rawLogisticsStatus`.
- `logisticsUpdatedAt`.
- `estimatedArrivalAt`.
- `deliveredAt`.
- `location`.

Rules:

- If status becomes `DELIVERED`, the service writes `deliveredAt` and evaluates delivered-not-received alerts.
- If ETA is overdue and the package is not delivered, the service creates an ETA-overdue alert.
- Status updates create tracking events and audit logs.

## DELETE /package-prealerts/:id

Deletes one prealert item from active operations by voiding it.

Rules:

- The row is not physically removed. WMS sets `receivingStatus = VOIDED` and stores a void reason for auditability.
- Open alerts for the prealert are closed as ignored.
- Voided prealerts are excluded from the default prealert list, Google Sheets push, and inbound auto-match.
- Received or inbound-linked prealerts cannot be deleted from the prealert page.
- The operation writes an audit log with before and after snapshots.

Response shape:

```json
{
  "deletedPrealertId": "prealert-item-id",
  "item": {
    "id": "prealert-item-id",
    "receivingStatus": "VOIDED"
  }
}
```

## POST /package-prealerts/bulk-delete

Voids multiple selected prealert items in one operation.

Request shape:

```json
{
  "ids": ["prealert-item-id-1", "prealert-item-id-2"]
}
```

Rules:

- The request accepts up to 200 ids.
- Deletion still means audit-safe voiding, not physical deletion.
- Rows already `VOIDED`, already received, or linked to inbound records are skipped and returned with a reason.
- Each deleted row writes its own audit log entry and closes open alerts as ignored.
- Deleted rows are excluded from default list results, Google Sheets push, and inbound auto-match.

Response shape:

```json
{
  "requested": 2,
  "deleted": 1,
  "skipped": [
    {
      "id": "prealert-item-id-2",
      "trackingNo": "1Z...",
      "reason": "已入库预报不能删除"
    }
  ],
  "items": []
}
```

## GET /package-prealerts/alerts

Lists package alerts with the linked prealert package.

Query parameters:

- `status`: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `IGNORED`.
- `alertType`.
- `customerId`.
- Pagination and search parameters.

## PATCH /package-prealerts/alerts/:id

Updates alert handling status.

Allowed statuses:

- `IN_PROGRESS`
- `RESOLVED`
- `IGNORED`

`resolutionNote` is required. Handling writes an audit log.

## Google Sheets Exchange

The current external-system integration mode uses the provided Google spreadsheet as the shared exchange layer.

Spreadsheet:

- URL: `https://docs.google.com/spreadsheets/d/1YUMuLn8acn6S-Bn8-Vn78DzbnOgL0Wmc_XmccApEY5s/edit`
- WMS writes and updates only sheet `预报`.
- WMS reads sheet `订单` to enrich Apple-order prealerts with real tracking data.
- WMS reads sheet `状态` to pull warehouse receiving results.
- Other sheets in the spreadsheet are not read or modified by this integration.
- `预报`, `订单`, and `状态` must keep the first row as headers matching the template fields.

Flow:

1. WMS writes new prealerts to `预报`.
2. WMS reads `订单`, matches Apple links, completes missing tracking/model/name/warehouse data in WMS, and updates the matching row in `预报`.
3. The partner system reads `预报`.
4. The partner system or warehouse writes receiving results to `状态`.
5. WMS reads `状态` and updates receiving status and alerts.

Required environment variables:

- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_CLIENT_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- `GOOGLE_SHEETS_PREALERT_SHEET_NAME` defaults to `预报`
- `GOOGLE_SHEETS_ORDER_SHEET_NAME` defaults to `订单`
- `GOOGLE_SHEETS_STATUS_SHEET_NAME` defaults to `状态`

The Google spreadsheet must be shared with the service account email as Editor so WMS can append/update `预报` and read `订单` and `状态`.

### GET /package-prealerts/integrations/sheets/template

Returns the recommended Google Sheet names, required columns, matching rule, and alert rule.

### POST /package-prealerts/integrations/sheets/push

Pushes up to 200 package prealerts with `exchangePushStatus = PENDING` or `FAILED` to the Google Sheet `预报`.

WMS writes only operator-marked handoff fields:

- `链接`: Apple order link when the original prealert link is an Apple `/vieworder/` URL.
- `型号`: imported `productModel`, if available.
- `姓名`: imported `recipientName`, if available.
- `物流类型`: carrier when WMS already has a real UPS/USPS/FedEx tracking number.
- `物流单号`: real carrier tracking number when WMS already has one. Temporary `APPLE-W...` order references are never pushed as carrier tracking numbers.
- `物流查询链接`: original non-Apple carrier link or a generated UPS/USPS/FedEx tracking URL when WMS has a real carrier tracking number.
- `查询时间`: WMS push time.
- `仓库`: item warehouse, falling back to batch warehouse.
- `客户`: WMS customer name, falling back to customer code only when the name is empty.

WMS leaves `物流类型`, `物流单号`, `预计交付日期`, `账单姓名`, and `订单状态` blank when it only has an Apple order reference. Direct Apple order links are saved and pushed as order links, but the Apple page may block anonymous scraping or hide product details behind dynamic verification. WMS therefore does not invent `型号`; it pushes model data only when the import file or a future trusted adapter provides it.

Successful pushes update the WMS row:

- `exchangePushStatus = PUSHED`
- `exchangeRecordId = 预报:<prealert item id>`
- `exchangePushedAt = now`

Push failures are stored in `exchangeSyncError`, and the row stays retryable with `exchangePushStatus = FAILED`.

### POST /package-prealerts/integrations/sheets/orders

Reads all rows from Google Sheet `订单`, enriches matching WMS prealerts, and updates the corresponding row in Google Sheet `预报`.

`订单` fields used by WMS:

- `预报仓库` or `仓库`: stored as item warehouse/notes and later written to `预报`.`仓库`.
- `单号` or `物流单号`: real UPS/USPS/FedEx tracking number.
- `邮箱`: accepted for matching context, not currently stored in WMS.
- `名字` or `姓名`: stored as recipient name and later written to `预报`.`姓名`.
- `超链接`, `链接`, `订单链接`, or `Apple订单链接`: Apple order link used to match WMS prealerts.

Matching rule:

1. Prefer Apple link or Apple order number extracted from `/vieworder/W.../...`.
2. Fall back to `单号` / `物流单号` when it already matches a WMS prealert.

Enrichment rules:

- If WMS still has a temporary `APPLE-W...` order reference and `订单`.`单号` or `订单`.`物流单号` contains a real tracking number, WMS replaces the local tracking number with the real one.
- Carrier is detected from the real tracking number, such as `1Z...` for UPS, or from known carrier links when available.
- `订单`.`预报仓库` updates WMS item notes and is written back to `预报`.`仓库`.
- `订单`.`名字` updates WMS recipient name and is written back to `预报`.`姓名`.
- WMS updates the matching existing `预报` row instead of appending a duplicate row.

### POST /package-prealerts/integrations/sheets/pull

Reads all rows from the Google Sheet `状态` and updates WMS records.

Matching rule:

1. Use `预报ID` when present.
2. Fall back to `物流单号`.
3. If both are empty, fall back to `链接` / `订单链接` / `Apple订单链接`, matching the original Apple order link or extracted Apple order number.

Receiving rules:

- If WMS matched the row by `预报ID` or Apple order link, and the row contains a real carrier `物流单号`, WMS replaces the temporary `APPLE-W...` order reference with that real tracking number and detects the carrier from `物流类型` or `物流查询链接`.
- When a real tracking number replaces an Apple order reference and the item is not already received, WMS marks the prealert as retryable for Google Sheets push. The next `写入预报` appends a refreshed prealert row containing the real tracking number.
- `入库日期` or `入库时间` present: set `receivingStatus = RECEIVED`.
- `入库状态` equals `已收到`, `已入库`, or `RECEIVED`: set `receivingStatus = RECEIVED`.
- `提醒` contains `未收到`: create/open `DELIVERED_NOT_RECEIVED`.
- `订单状态 = DELIVERED` and no `入库日期`: create/open `DELIVERED_NOT_RECEIVED`.

If the status row matches but has no receiving status, inbound date, delivered date, order status, or reminder, WMS only records that the row was read. The visible page counters change only when the row contains a value that maps to `RECEIVED` or an alert rule.

### POST /package-prealerts/integrations/sheets/sync

Runs push first, then order enrichment, then status pull:

1. Append missing WMS prealerts to `预报`.
2. Read `订单`, enrich WMS local data, and update existing `预报` rows.
3. Read `状态` and update receiving state and alerts.

This endpoint is intended for manual local verification first. Once the Google Sheet writeback format is stable, the same service can be wired to a scheduled worker.

## Inbound Confirmation Link

During `POST /inbound/drafts/:id/confirm`, the backend checks confirmed inbound item tracking numbers. If a matching package prealert is still `NOT_RECEIVED`, it is updated to:

- `receivingStatus = RECEIVED`
- linked `inboundBatchId`
- linked first matching `inboundItemId`

Open delivered-not-received and ETA-overdue alerts are resolved automatically.
