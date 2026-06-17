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

## Scan UPS

`POST /api/v1/inbound/drafts/:id/ups`

```json
{
  "upsTrackingNo": "1Z999AA10123456784"
}
```

Returns normalized UPS data and duplicate status. This endpoint validates and checks the tracking number before item scans; UPS values are still stored on each preview item.

## Add Preview Item

`POST /api/v1/inbound/drafts/:id/items`

```json
{
  "upsTrackingNo": "1Z999AA10123456784",
  "upc": "194253149189",
  "imei": "356789012345678"
}
```

Rules:

- UPC must match an active UPC mapping and active product, otherwise the preview item is saved as `EXCEPTION`.
- If unmatched UPC exceptions are enabled, an `UPC_NOT_FOUND` exception record is created.
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

- Rechecks duplicate IMEI, Serial, and UPS values.
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

Search covers UPS, UPC, IMEI, Serial, customer code/name, product SKU, and product name.

## Get Record

`GET /api/v1/inbound/records/:id`

Returns one inbound item with batch, customer, product, linked inventory item, and exception summary.
