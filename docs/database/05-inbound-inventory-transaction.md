# Inbound Inventory Transaction

## Purpose

This document records the phase-seven transaction boundary for converting inbound preview rows into item-level inventory.

## Tables

- `inbound_batches`: owns the draft or confirmed receiving session.
- `inbound_items`: owns scanned UPC, UPS, IMEI, Serial, product match, status, and inventory link.
- `inventory_items`: owns confirmed customer inventory.
- `exception_records`: owns UPC, IMEI, Serial, and UPS exception records.
- `audit_logs`: owns the final `INBOUND_CONFIRM` operation record.

## Draft State

`inbound_batches.status = DRAFT` means operators can add, remove, and clear preview items.

Preview rows use:

- `PENDING`: matched and confirmable.
- `EXCEPTION`: saved for operator visibility but not confirmable.
- `VOIDED`: removed from active preview.

## Confirmation Transaction

`POST /inbound/drafts/:id/confirm` performs one database transaction:

1. Load the draft and preview rows.
2. Select `PENDING` rows with matched products.
3. Reject duplicate IMEI or Serial values inside the same draft before inventory writes.
4. Reject IMEI or Serial values already present in `inventory_items`.
5. Recheck duplicate UPS against prior confirmed inbound rows.
6. Create exception records for duplicate rows when configured.
7. Create inventory rows for valid rows.
8. Update confirmed inbound rows with `inventoryItemId`.
9. Mark duplicate package-tracking rows `EXCEPTION`.
10. Mark the batch `CONFIRMED` and set `confirmedAt`.
11. Write an `INBOUND_CONFIRM` audit log.

If any write in the transaction fails, the confirmation must roll back and leave no partial inventory.

## Inventory Status

New inventory created from inbound confirmation starts as `IN_STOCK`.

Outbound phases later move inventory to `PACKED` and `OUTBOUND`.

## Duplicate Handling

Duplicate IMEI and Serial values stop confirmation and do not create inventory. The draft stays
open so the operator can correct or delete the duplicate row before confirming again.

Duplicate UPS values from prior confirmed inbound records do not create inventory in the current phase. Multiple rows in the same draft may still share one UPS value because one package can contain multiple units.

## Force Confirm Transaction

`POST /inbound/records/:id/force-confirm` is a controlled follow-up transaction for one exception inbound item.

Before the write transaction, the service checks:

1. The inbound row exists and is `EXCEPTION`.
2. The parent batch is already `CONFIRMED`.
3. The row has a matched active product.
4. The row does not already have `inventoryItemId`.
5. IMEI or Serial is not already present in `inventory_items`.
6. The operator supplied a reason.

Inside the transaction, the repository:

1. Creates one `inventory_items` row using the original customer, warehouse, product, UPC, package tracking number, IMEI, and Serial.
2. Updates open `exception_records` for the inbound row to `RESOLVED` with the force reason.
3. Updates the inbound row to `CONFIRMED`, links the inventory item, and stores `forcedInbound`, `forceReason`, `forcedAt`, and `forcedById`.
4. Writes an `INBOUND_FORCE_CONFIRM` audit log with before/after snapshots.

If any write fails, the transaction rolls back and no partial inventory is created.
