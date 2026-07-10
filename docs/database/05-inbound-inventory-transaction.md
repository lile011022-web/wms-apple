# Inbound Inventory Transaction

## Purpose

This document records the phase-seven transaction boundary for converting inbound preview rows into item-level inventory.

## Tables

- `inbound_batches`: owns the draft or confirmed receiving session, including the creating account
  and login `creatorSessionId`.
- `inbound_items`: owns scanned UPC, UPS, IMEI, Serial, product match, status, and inventory link.
- `inventory_items`: owns confirmed customer inventory.
- `exception_records`: owns UPC, IMEI, Serial, and UPS exception records.
- `audit_logs`: owns the final `INBOUND_CONFIRM` operation record.

## Draft State

`inbound_batches.status = DRAFT` means operators can add, remove, and clear preview items.

Every new draft stores both its creating account ID and the UUID `creatorSessionId` from the access
token. All draft reads and writes must match both values. This makes two logins using the same account
independent receiving sessions instead of shared access to one mutable draft.

For an older open batch with `creatorSessionId IS NULL`, only the original creating account may claim
the draft. The first valid session uses a conditional update that matches the original account,
`status = DRAFT`, and `creatorSessionId IS NULL`. If that update wins, the session owns the draft;
other concurrent sessions must reload and are rejected unless they match the stored value.

Preview rows use:

- `PENDING`: matched and confirmable.
- `EXCEPTION`: saved for operator visibility but not confirmable.
- `VOIDED`: removed from active preview.

Separate drafts may target the same `customerId`. Their ownership and confirmations remain isolated,
while inventory created from both batches aggregates naturally under that customer.

## Draft Mutation Serialization

Add, update, delete, clear, and confirm each execute in a database transaction that first locks the
parent `inbound_batches` row with `SELECT ... FOR UPDATE`. After acquiring the lock, the transaction
rechecks:

1. the batch still has `status = DRAFT`;
2. the account matches the creator;
3. `creatorSessionId` matches the current login session, after any eligible legacy claim.

Only then may the transaction change preview rows or continue confirmation. Operations on different
batches remain independent, but operations on the same batch run serially. If confirmation closes the
batch first, a waiting add, update, delete, or clear request observes `CONFIRMED` and performs no
write. This prevents confirmed batches from acquiring orphan `PENDING` rows.

## Confirmation Transaction

`POST /inbound/drafts/:id/confirm` performs one database transaction:

1. Lock the parent batch row with `SELECT ... FOR UPDATE`.
2. Verify `DRAFT` status and require the creating account and `creatorSessionId`; only that login
   session may perform final confirmation.
3. Load the preview rows and select `PENDING` rows with matched products.
4. Reject confirmation if no confirmable row remains after the lock. This covers a concurrent clear
   or delete-last-item request that completed immediately before confirmation obtained the lock.
5. Reject duplicate IMEI or Serial values inside the same draft before inventory writes.
6. Reject IMEI or Serial values already present in `inventory_items`.
7. Recheck duplicate UPS against prior confirmed inbound rows.
8. Create exception records for duplicate rows when configured.
9. Create inventory rows for valid rows.
10. Update confirmed inbound rows with `inventoryItemId`.
11. Mark duplicate package-tracking rows `EXCEPTION`.
12. Mark the batch `CONFIRMED` and set `confirmedAt`.
13. Write an `INBOUND_CONFIRM` audit log with the creating session's operator identity.

If any write in the transaction fails, the confirmation must roll back and leave no partial inventory.
The batch-row lock is also rolled back, allowing the creating session to correct the still-open draft
and retry.

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
