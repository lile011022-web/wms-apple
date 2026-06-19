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
- Products with `requiresImei = true` require a valid IMEI.
- Products with `requiresImei = false` require either Serial or IMEI in this phase.
- Duplicate IMEI or Serial creates an exception preview item when duplicate detection is enabled.

## Remove Or Clear Preview Items

```text
DELETE /api/v1/inbound/drafts/:id/items/:itemId
DELETE /api/v1/inbound/drafts/:id/items
```

Removal is logical. Preview rows move to `VOIDED` so history remains traceable during the draft lifecycle.

## Confirm Draft

`POST /api/v1/inbound/drafts/:id/confirm`

Confirmation runs inside one database transaction:

- Rechecks duplicate IMEI, Serial, and package tracking values.
- Creates `inventory_items` for confirmable preview rows.
- Links each confirmed inbound row to its inventory item.
- Marks duplicate rows as `EXCEPTION`.
- Marks the batch `CONFIRMED`.
- Writes an `INBOUND_CONFIRM` audit log.

Drafts with no confirmable rows are rejected.

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
