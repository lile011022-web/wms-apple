# Inbound Scan APIs

## Scope

Phase seven adds customer-locked inbound draft scanning, preview item management, inbound confirmation, and inbound record lookup.

Current controllers require `inbound.manage`.

## Create Draft

`POST /api/v1/inbound/drafts`

```json
{
  "customerId": "customer-1",
  "warehouseId": "warehouse-1",
  "notes": "Morning receiving lane A"
}
```

Rules:

- `customerId` is required when `scan.inbound.requiresLockedCustomer` is enabled.
- Inactive customers cannot be locked for new inbound drafts.
- `warehouseId` is optional; when omitted, `warehouse.defaultId` is used.
- Inactive warehouses cannot receive inbound scans.

## Get Draft

`GET /api/v1/inbound/drafts/:id`

Returns the draft header, locked customer, warehouse, preview summary, and non-voided preview items.
The web client uses this response to compute the confirmation review panel in real time, including
unique UPC count, product count, package tracking count, total product units, exception count, and
per-UPC product counts. No separate summary endpoint is required for this draft-level review.

## Scan Package Tracking Number

`POST /api/v1/inbound/drafts/:id/ups`

```json
{
  "upsTrackingNo": "9400111899223857000000"
}
```

Returns normalized package tracking data and duplicate status. This endpoint accepts UPS, USPS, and FedEx tracking numbers, then validates and checks the tracking number before item scans. The request and response keep the legacy `upsTrackingNo` field name for API compatibility.

## Add Preview Item

`POST /api/v1/inbound/drafts/:id/items`

```json
{
  "upsTrackingNo": "9611020987654312345672",
  "upc": "194253149189",
  "imei": "356789012345678"
}
```

Rules:

- UPC must match an active UPC mapping and active product, otherwise the preview item is saved as `EXCEPTION`.
- If unmatched UPC exceptions are enabled, an `UPC_NOT_MATCHED` exception record is created.
- Products with `requiresImei = true` require a valid IMEI. IMEI validation accepts 15-digit numeric phone IMEI values and 10-18 character uppercase alphanumeric iPad identifiers such as `SH9LRL91YFC`.
- Products with `requiresImei = false` require either Serial or IMEI in this phase.
- Duplicate IMEI or Serial creates an exception preview item when duplicate detection is enabled.

## Import Preview Items

`POST /api/v1/inbound/drafts/:id/items/import`

The inbound scan page downloads a CSV template, parses it in the browser, and submits parsed rows to
this JSON endpoint. Standard CSV template columns are `单号`, `upc`, and `imei`. The web parser also
accepts `upsTrackingNo` or `trackingNo` as package-tracking aliases. The API payload still accepts
optional `serial` for non-IMEI product workflows, but `serial` is not required in the standard
inbound template.

Request:

```json
{
  "items": [
    {
      "upsTrackingNo": "1Z999AA10123456784",
      "upc": "194253149189",
      "imei": "356789012345678"
    }
  ]
}
```

Rules:

- Up to 1000 rows can be submitted in one import.
- Each row is added with the same validation and exception behavior as `POST /drafts/:id/items`.
- Standard CSV imports use three required columns: package tracking number (`单号`), UPC, and IMEI.
- Valid rows are appended to the current draft immediately.
- Failed rows are reported with row number and error message; other valid rows can still be imported.
- Importing rows does not confirm inventory. Operators must still review the draft summary and click
  confirm inbound.

Response `data`:

```json
{
  "importedCount": 1,
  "failedCount": 0,
  "failedRows": [],
  "draft": {
    "id": "draft_id",
    "summary": { "totalItems": 1, "pendingItems": 1, "exceptionItems": 0, "confirmedItems": 0 }
  }
}
```

## Remove Or Clear Preview Items

```text
DELETE /api/v1/inbound/drafts/:id/items/:itemId
DELETE /api/v1/inbound/drafts/:id/items
```

Removal is logical. Preview rows move to `VOIDED` so history remains traceable during the draft lifecycle.

## Confirm Draft

`POST /api/v1/inbound/drafts/:id/confirm`

Confirmation runs inside one database transaction:

- Rejects same-draft duplicate IMEI or Serial values before inventory writes.
- Rechecks duplicate IMEI, Serial, and package tracking values.
- Creates `inventory_items` for confirmable preview rows.
- Links each confirmed inbound row to its inventory item.
- Marks duplicate rows as `EXCEPTION`.
- Marks the batch `CONFIRMED`.
- Writes an `INBOUND_CONFIRM` audit log.

Drafts with no confirmable rows are rejected. Drafts with repeated IMEI or Serial values inside
the same active preview are rejected with a business error so the operator can delete or fix the
duplicate row before confirming.

## List Records

`GET /api/v1/inbound/records`

Query parameters:

- `page`, `pageSize`, `search`, `sortBy`, `sortOrder`
- `customerId`
- `warehouseId`
- `status`
- `dateFrom`
- `dateTo`

Search covers package tracking number, UPC, IMEI, Serial, customer code/name, product SKU, and product name.

## Get Record

`GET /api/v1/inbound/records/:id`

Returns one inbound item with batch, customer, product, linked inventory item, and exception summary.
