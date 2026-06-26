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

Returns normalized package tracking data and duplicate status. This endpoint auto-accepts UPS
tracking numbers and FedEx tracking numbers that start with `9622` and contain 22 to 34 digits in
total before item scans, but it still reports duplicate counts from both confirmed inbound records
and the current draft. USPS, other FedEx formats, and unsupported package tracking formats return
`valid: false` instead of failing the request, so the web page can ask the operator whether to
continue. The request and response keep the legacy `upsTrackingNo` field name for API compatibility.

Example response:

```json
{
  "draftId": "draft-1",
  "upsTrackingNo": "1Z999AA10123456784",
  "valid": true,
  "duplicate": false,
  "duplicateCount": 0,
  "currentDraftDuplicate": true,
  "currentDraftDuplicateCount": 1
}
```

## Add Preview Item

`POST /api/v1/inbound/drafts/:id/items`

```json
{
  "upsTrackingNo": "9622123456789012345678",
  "upc": "194253149189",
  "imei": "356789012345678",
  "scanMode": "STANDARD",
  "trackingExceptionConfirmed": false
}
```

Rules:

- `upsTrackingNo` is required for scan entry. The API keeps the legacy field name, but the business
  meaning is package tracking number.
- `trackingExceptionConfirmed` is optional. It should only be sent after the operator confirms a
  package tracking warning. When true, USPS, non-9622 FedEx, duplicate tracking numbers from
  confirmed records or the current draft, or other unsupported tracking formats can be saved to the
  draft instead of being rejected.
- `scanMode` is optional and defaults to `STANDARD`.
- `STANDARD` mode is the strict mode used by the web page's `一版模式`: package tracking number, UPC,
  and IMEI/Serial are required according to product rules.
- `TRACKING_UPC` mode is the simplified web page mode: package tracking number and UPC can create a
  normal pending preview item without IMEI/Serial, as long as the UPC matches an active product.
- UPC must match an active UPC mapping and active product, otherwise the preview item is saved as `EXCEPTION`.
- If unmatched UPC exceptions are enabled, an `UPC_NOT_MATCHED` exception record is created.
- In `STANDARD` mode, products with `requiresImei = true` require a valid IMEI. IMEI validation accepts 15-digit numeric phone IMEI values and 10-18 character uppercase alphanumeric iPad identifiers such as `SH9LRL91YFC`.
- In `STANDARD` mode, products with `requiresImei = false` require either Serial or IMEI in this phase.
- IMEI or Serial duplicated inside the same active draft is rejected immediately and must not create
  another `PENDING` preview row.
- IMEI or Serial duplicated against existing inventory creates an exception preview item when
  duplicate detection is enabled.
- If the latest non-voided preview item in the active draft is still `EXCEPTION`, the API rejects
  adding another item with a conflict error. The operator must correct or remove that latest
  exception row first.

The web client shows the latest added row below the scanner inputs. When exception rows exist in the
active draft, clicking the exception metric locates the first exception row and opens that row for
inline editing. Saving the row overwrites the original preview item and re-runs the same validation
rules; it does not create a second preview item.

## Update Preview Item

`PATCH /api/v1/inbound/drafts/:id/items/:itemId`

```json
{
  "upsTrackingNo": "1Z586F5V0387747419",
  "upc": "195950626100",
  "imei": "353621843307253",
  "scanMode": "STANDARD"
}
```

Rules:

- Only rows in an open `DRAFT` batch can be updated.
- Only `PENDING` or `EXCEPTION` preview rows can be corrected.
- The request body follows the same fields and validation rules as `POST /drafts/:id/items`.
- Saving a correction overwrites the original `InboundItem` row. It must not create a new inbound
  item.
- If the corrected IMEI or Serial would duplicate another non-voided row in the same draft, the API
  rejects the correction before saving.
- Existing open exception records for the corrected row are marked `INVALID`, then the corrected row
  is validated again. If the corrected values are still invalid, a new open exception can be created
  for the same row.

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
- If the latest non-voided preview item in the active draft is still `EXCEPTION`, import is rejected
  before any CSV row is appended. Correct or remove that latest exception row first.
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

- Rejects confirmation if the latest non-voided preview item is still `EXCEPTION`, so the operator
  must correct or remove the latest abnormal row before inventory can be confirmed.
- Rejects same-draft duplicate IMEI or Serial values before inventory writes.
- Rejects IMEI or Serial values that already exist in inventory before inventory writes.
- Rechecks duplicate package tracking values.
- Creates `inventory_items` for confirmable preview rows.
- Links each confirmed inbound row to its inventory item.
- Marks duplicate package-tracking rows as `EXCEPTION`.
- Marks the batch `CONFIRMED`.
- Writes an `INBOUND_CONFIRM` audit log.

Drafts with no confirmable rows are rejected. Drafts with repeated IMEI or Serial values inside
the same active preview are rejected with a business error so the operator can delete or fix the
duplicate row before confirming. Drafts with IMEI or Serial values already present in inventory
are also rejected with a business error and remain open for correction.

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

## Force Confirm Exception Record

`POST /api/v1/inbound/records/:id/force-confirm`

```json
{
  "reason": "FedEx tracking exception reviewed by supervisor."
}
```

This endpoint is for controlled exception handling after an inbound batch has already been confirmed.

Rules:

- Only `EXCEPTION` inbound records can be force confirmed.
- The record must already have a matched active product.
- The record must not already be linked to inventory.
- The batch must already be `CONFIRMED`.
- IMEI or Serial must still be unique in inventory.
- A non-empty reason is required.

On success the API creates the missing inventory item, marks the inbound row `CONFIRMED`, saves `forcedInbound`, `forceReason`, `forcedAt`, and `forcedById`, resolves open exception records for that inbound row, and writes an `INBOUND_FORCE_CONFIRM` audit log.
