# Batch Customer Change APIs

Phase twelve adds preview-first customer correction APIs for confirmed inbound records that still have changeable inventory.

Base path: `/api/v1/customer-changes`

Permission: `customers.manage`

## Candidates

`GET /customer-changes/candidates`

Query parameters:

- `currentCustomerId`: current record owner.
- `warehouseId`: receiving warehouse.
- `dateFrom`, `dateTo`: scanned time range.
- `upsTrackingNo`, `upc`, `imei`, `productName`, `search`: record filters.
- `page`, `pageSize`, `sortBy`, `sortOrder`: standard pagination.

Only confirmed inbound records with linked inventory in `IN_STOCK` or `EXCEPTION` status are returned. `PACKED` and `OUTBOUND` inventory is not selectable.

## Preview

`POST /customer-changes/preview`

```json
{
  "currentCustomerId": "customer-1",
  "newCustomerId": "customer-2",
  "inboundItemIds": ["item-1", "item-2"]
}
```

The response returns `previewToken`, `canCommit`, impact counts, blocked rows, and affected row detail. The token is generated from the current record ownership, inventory status, and update timestamps.

## Commit

`POST /customer-changes/commit`

```json
{
  "currentCustomerId": "customer-1",
  "newCustomerId": "customer-2",
  "inboundItemIds": ["item-1", "item-2"],
  "reason": "Wrong customer selected during receiving.",
  "previewToken": "..."
}
```

Commit re-runs preview validation and rejects stale tokens. A successful commit updates:

- `InboundItem.customerId`
- linked `InventoryItem.customerId`
- linked `ExceptionRecord.customerId`
- `CustomerChangeLog`
- `AuditLog` with action `CUSTOMER_BATCH_CHANGE`

## Logs

`GET /customer-changes/logs`

Query parameters:

- `oldCustomerId`
- `newCustomerId`
- `operatorId`
- `search`
- standard pagination and sorting

Logs return before/after customer references, operator, reason, affected count, affected IDs, and snapshots.
