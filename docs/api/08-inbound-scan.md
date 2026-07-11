# Inbound Scan APIs

## Scope

Phase seven adds customer-locked inbound draft scanning, preview item management, inbound confirmation, and inbound record lookup.

Current controllers require `inbound.manage`.

## Draft Session Ownership

Inbound draft endpoints authorize against both fields recovered from the access token:

- authenticated account ID;
- login `sessionId`.

A new draft records both values, and only that creating login session can read, restore, review,
mutate, import into, clear, or confirm it. A second login for the same account is a different session
and cannot operate the first session's draft. A different operator is also rejected.

For backward compatibility, an open legacy draft with an empty `creatorSessionId` can be claimed only
by its original creating account. The first valid session from that account performs an atomic
claim; all later requests must match the claimed session. Legacy drafts are never claimable by a
different account.

Different operators or login sessions may create separate drafts for the same customer. Each session
confirms its own draft independently, while the resulting inventory remains grouped by the shared
`customerId`.

## Create Draft

`POST /api/v1/inbound/drafts`

```json
{
  "customerId": "customer-1",
  "customerAliasId": "alias-1",
  "warehouseId": "warehouse-1",
  "notes": "Morning receiving lane A"
}
```

Rules:

- `customerId` is required when `scan.inbound.requiresLockedCustomer` is enabled.
- Inactive customers cannot be locked for new inbound drafts.
- `customerAliasId` is optional. When present, it must belong to the selected customer and be active.
  The alias records the receiving name; inventory ownership remains on `customerId`.
- `warehouseId` is optional; when omitted, `warehouse.defaultId` is used.
- Inactive warehouses cannot receive inbound scans.
- The created draft stores the current account ID and login `sessionId`; these values define its
  owner for the rest of the draft lifecycle.

## Get Draft

`GET /api/v1/inbound/drafts/:id`

Returns the draft header, locked customer, optional customer alias, warehouse, preview summary, and non-voided preview items.
The web client uses this response to compute the confirmation review panel in real time, including
unique UPC count, product count, package tracking count, total product units, exception count, and
per-UPC product counts. No separate summary endpoint is required for this draft-level review.
Preview items include `scannedAt`, `createdAt`, `updatedAt`, and linked `exceptions` so the web
client can keep scan-time ascending review order and show a readable exception reason beside any
`EXCEPTION` row.

The requested draft must belong to the current account and login session. A same-account request
from another login session is rejected. If the draft is an eligible legacy draft, this request may
atomically claim it for the original account's current session before returning it.

`GET /api/v1/inbound/drafts/by-batch/:batchNo`

Restores an open draft by its operator-facing batch number, for example
`INB-20260701152205-Q2QEUT`. The endpoint returns the same payload as `GET /drafts/:id` and is used
by the scan page's recovery control when a browser has cached a newer empty draft. Only `DRAFT`
batches can be restored here; confirmed batches remain in inbound records.

Batch-number recovery follows the same account-and-session ownership rule as direct ID lookup.

## Scan Package Tracking Number

`POST /api/v1/inbound/drafts/:id/ups`

```json
{
  "upsTrackingNo": "9400111899223857000000"
}
```

Returns normalized package tracking data, explicit format/auto-accept decisions, and duplicate status.
The request and response keep the legacy `upsTrackingNo` field name for API compatibility.

The draft must be owned by the current account and login session before duplicate or format review
is returned.

Response decision fields:

- `formatValid` is `true` when the normalized value matches a supported UPS, USPS, FedEx, or
  `BB0000` warehouse-compensation format.
- `autoAccepted` is `true` for complete UPS values, 9622-prefixed FedEx values containing 22 to 34
  digits, exactly 34-digit 9632-prefixed FedEx values, and valid `BB0000` values. Duplicate status is reported separately and can still require
  confirmation.
- `valid` is the legacy compatibility alias for `autoAccepted`. Clients must not interpret it as the
  supported-format decision; new clients should read `formatValid` and `autoAccepted` directly.
- USPS and FedEx values outside the configured 9622/9632 rules return `formatValid: true`, `autoAccepted: false`, and `valid: false`
  so the web page can require explicit operator confirmation.
- Unsupported or malformed values return all three decision fields as `false`. The web page must keep
  focus in the package tracking field and must not display a continue action for such a value.

Example response:

```json
{
  "draftId": "draft-1",
  "upsTrackingNo": "1Z999AA10123456784",
  "formatValid": true,
  "autoAccepted": true,
  "valid": true,
  "duplicate": false,
  "duplicateCount": 0,
  "currentDraftDuplicate": true,
  "currentDraftDuplicateCount": 1
}
```

Web focus rules using this endpoint:

- Automatic focus and Enter must run the same local decision and `scanUps` review before moving to
  UPC. A stale asynchronous response for an older input value must not move focus.
- Only a complete UPS value, a complete 9622-prefixed FedEx value, or an exactly 34-digit
  9632-prefixed FedEx value is eligible for idle-timer automatic movement. USPS and other FedEx
  values stay in the package tracking field until the operator
  confirms their format-valid warning.
- `BB0000` is API-auto-accepted, but the web page requires Enter or a scanner completion key before
  moving focus because the value may contain an additional alphanumeric suffix.
- A malformed value never moves focus and never exposes `继续入库`.

## Add Preview Item

## Restore My Latest Draft

`GET /api/v1/inbound/drafts/latest/my`

Returns the current authenticated login session's latest open `DRAFT` inbound batch, or `null` when
that session has no unfinished draft. The inbound scan page uses this endpoint when opening the page
without a valid locally locked draft, so operators can leave for another page and come back to their
own latest unfinished receiving batch.

Rules:

- Only a `DRAFT` owned by the current account and login session can be returned.
- A second login session for the same account does not restore another session's draft.
- An eligible legacy draft from the same account may be atomically claimed by the first session that
  restores it.
- Confirmed or closed batches are not returned.
- The web page should restore the draft's customer, customer alias, warehouse, review summary, and
  pending detail rows before the operator continues scanning.

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
  package tracking warning. When true, USPS, non-9622 FedEx, and duplicate tracking numbers from
  confirmed records or the current draft can be saved to the draft. Completely unsupported package
  tracking values, random text, and non-tracking values are still rejected. `BB0000` warehouse
  compensation package numbers, including the exact value `BB0000`, do not need this exception flag
  unless a duplicate warning is being deliberately confirmed.
- `scanMode` is optional and defaults to `STANDARD`.
- `STANDARD` mode is the strict mode used by the web page's `一版模式`: package tracking number, UPC,
  and IMEI/Serial are required according to product rules.
- `TRACKING_UPC` mode is the simplified web page mode: package tracking number and UPC can create a
  normal pending preview item without IMEI/Serial, as long as the UPC matches an active product.
- UPC must match an active UPC mapping and active product. Unmatched UPC values are rejected before
  a preview row is saved, so the operator must first maintain the UPC in 商品管理 and scan again.
- In `STANDARD` mode, products with `requiresImei = true` require a valid IMEI. IMEI validation accepts 15-digit numeric phone IMEI values and 10-18 character uppercase alphanumeric iPad identifiers such as `SH9LRL91YFC`.
- In `STANDARD` mode, products with `requiresImei = false` require either Serial or IMEI in this phase.
- IMEI or Serial duplicated inside the same active draft is rejected immediately and must not create
  another `PENDING` preview row.
- IMEI or Serial duplicated against existing inventory is rejected before a preview row is saved
  when duplicate detection is enabled.
- If the latest non-voided preview item in the active draft is still `EXCEPTION`, the API rejects
  adding another item with a conflict error. The operator must correct or remove that latest
  exception row first.
- The current account and login session must own the draft.
- The operation locks the parent batch row with `FOR UPDATE` before checking `DRAFT` status and
  inserting the preview row. Concurrent add, update, delete, clear, and confirm operations on the
  same batch therefore run serially.

The web client shows the current inbound draft directly below the customer lock area and above the
scanner inputs. The draft detail table is the pre-confirmation review area: `PENDING` and
`EXCEPTION` rows can be edited, saved, cancelled, or removed before final inbound confirmation.
Saving the row overwrites the original preview item and re-runs the same validation rules; it does
not create a second preview item. The draft detail table stays in scan-time ascending order, so
earlier rows remain at the top and the newest scan is shown at the bottom.

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
- Web table actions must stay usable at normal desktop widths; when the table is narrower than its
  content, the action column remains visible while the row can scroll horizontally.
- The current account and login session must own the draft. The operation takes the same batch-row
  `FOR UPDATE` lock used by add, delete, clear, and confirm before changing the row.

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
- Each row is added with the same validation behavior as `POST /drafts/:id/items`.
- Every row append uses the same session ownership check and serialized batch-row lock as a manual
  add. Import cannot append a row after confirmation has acquired and closed the draft.
- Standard CSV imports use three required columns: package tracking number (`单号`), UPC, and IMEI.
- Valid rows are appended to the current draft immediately.
- Failed rows are reported with row number and error message; other valid rows can still be imported.
- Unmatched UPC rows, unsupported tracking rows, and inventory-duplicate IMEI/Serial rows are
  reported as failed rows instead of being appended as draft exceptions.
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

Delete-one and clear-all require the creating account and login session. Both operations lock the
parent batch row with `FOR UPDATE`, so they cannot race with add, update, or confirmation.

## Confirm Draft

`POST /api/v1/inbound/drafts/:id/confirm`

Confirmation runs inside one database transaction:

- Requires the current account and login session to match the draft creator. Final confirmation can
  be performed only by the creating login session.
- Locks the parent batch row with `FOR UPDATE` before checking ownership and `DRAFT` status. Add,
  update, delete, clear, and competing confirm requests wait and then recheck the final state.
- Rejects confirmation if the latest non-voided preview item is still `EXCEPTION`, so the operator
  must correct or remove the latest abnormal row before inventory can be confirmed.
- Rejects same-draft duplicate IMEI or Serial values before inventory writes.
- Rejects IMEI or Serial values that already exist in inventory before inventory writes.
- Rechecks duplicate package tracking values.
- Creates `inventory_items` for confirmable preview rows.
- Copies the draft's optional `customerAliasId` to confirmed inbound rows and inventory rows.
- Links each confirmed inbound row to its inventory item.
- Marks duplicate package-tracking rows as `EXCEPTION`.
- Marks the batch `CONFIRMED`.
- Writes an `INBOUND_CONFIRM` audit log.

Drafts with no confirmable rows are rejected. Drafts with repeated IMEI or Serial values inside
the same active preview are rejected with a business error so the operator can delete or fix the
duplicate row before confirming. Drafts with IMEI or Serial values already present in inventory
are also rejected with a business error and remain open for correction. If a database uniqueness
guard catches the duplicate during the final transaction, the API still returns the same readable
IMEI/Serial duplicate message rather than a generic `500` response.

Large restored drafts can contain hundreds of pending rows, so the confirmation transaction is
allowed a longer execution window than short single-row edits. If the database still times out, the
API returns a readable large-batch retry message instead of the generic database failure response.

## Correct Confirmed Records

Inbound record correction is for rows that already belong to a confirmed batch. Rows in an unfinished
`DRAFT` batch must be edited or deleted from the inbound scan page before final confirmation. The API
rejects record-correction requests against draft batches so a single row cannot create inventory and
partially confirm a still-open receiving draft.

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
