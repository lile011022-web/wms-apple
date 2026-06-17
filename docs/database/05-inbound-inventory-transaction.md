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
3. Recheck duplicate IMEI and Serial against `inventory_items`.
4. Recheck duplicate UPS against prior confirmed inbound rows.
5. Create exception records for duplicate rows when configured.
6. Create inventory rows for valid rows.
7. Update confirmed inbound rows with `inventoryItemId`.
8. Mark duplicate rows `EXCEPTION`.
9. Mark the batch `CONFIRMED` and set `confirmedAt`.
10. Write an `INBOUND_CONFIRM` audit log.

If any write in the transaction fails, the confirmation must roll back and leave no partial inventory.

## Inventory Status

New inventory created from inbound confirmation starts as `IN_STOCK`.

Outbound phases later move inventory to `PACKED` and `OUTBOUND`.

## Duplicate Handling

Duplicate IMEI and Serial values do not create inventory.

Duplicate UPS values from prior confirmed inbound records do not create inventory in the current phase. Multiple rows in the same draft may still share one UPS value because one package can contain multiple units.
