# Outbound Transaction

Outbound packing uses existing inventory rows and outbound box tables:

- `outbound_boxes`
- `outbound_box_items`
- `inventory_items`
- `audit_logs`

## Add Item Transaction

Adding an item to a box is transactional.

The transaction:

1. Reads the outbound box before snapshot.
2. Creates one `outbound_box_items` row.
3. Updates the linked `inventory_items` row to `PACKED`.
4. Sets `inventory_items.packedAt`.
5. Writes an `OUTBOUND_BOX_ITEM_ADD` audit log.
6. Returns the refreshed outbound box.

The `outbound_box_items.inventoryItemId` unique constraint prevents one inventory row from being packed into multiple boxes.

The service also checks before the transaction that:

- The box is `OPEN`.
- The inventory row exists.
- The inventory row belongs to the same customer and warehouse as the box.
- The inventory row is `IN_STOCK`.
- The inventory row is not already linked to an outbound box.

## Remove Item Transaction

Removing an item from an open box is transactional.

The transaction:

1. Reads the outbound box before snapshot.
2. Deletes the `outbound_box_items` row.
3. Updates the linked `inventory_items` row back to `IN_STOCK`.
4. Clears `inventory_items.packedAt`.
5. Writes an `OUTBOUND_BOX_ITEM_REMOVE` audit log.
6. Returns the refreshed outbound box.

Sealed boxes must be reopened before their item rows can be changed.

## Clear Box Transaction

Clearing an open box is transactional.

The transaction:

1. Reads the outbound box before snapshot.
2. Deletes all `outbound_box_items` rows for the box.
3. Updates affected `PACKED` inventory rows back to `IN_STOCK`.
4. Clears `packedAt`.
5. Writes an `OUTBOUND_BOX_ITEM_CLEAR` audit log.
6. Returns the cleared count and refreshed outbound box.

## Update Box Transaction

Editing open-box settings is transactional.

The transaction:

1. Reads the outbound box before snapshot.
2. Updates box name, size preset, custom size, weight in pounds, or notes.
3. Writes an `OUTBOUND_BOX_UPDATE` audit log.
4. Returns the refreshed outbound box.

## Seal Box Transaction

Sealing is the critical phase-ten transaction boundary.

The transaction:

1. Reads the outbound box and its item IDs.
2. Updates all linked inventory rows to `PACKED`.
3. Sets inventory `packedAt` to the seal timestamp as a final consistency guard.
4. Updates the outbound box to `SEALED`.
5. Sets `outbound_boxes.sealedAt`.
6. Writes an `OUTBOUND_BOX_SEAL` audit log.
7. Returns the refreshed sealed box.

If any step fails, the box status, inventory statuses, and audit log all roll back together.

## Reopen Box Transaction

Reopening is the rework transaction for sealed boxes.

The transaction:

1. Reads the sealed outbound box and current item IDs.
2. Updates the outbound box status to `OPEN`.
3. Clears `outbound_boxes.sealedAt`.
4. Keeps existing outbound box item links and inventory status unchanged.
5. Writes an `OUTBOUND_BOX_REOPEN` audit log.
6. Returns the refreshed open box.

After reopening, operators can add items, remove items, clear the box, edit settings, and seal again. Each follow-up operation writes its own audit log with the current operator.

## Current State Choice

Phase ten keeps sealed-box inventory in `PACKED`.

`OUTBOUND` is reserved for a later shipping or final outbound confirmation workflow. That later workflow should use a new transaction that moves sealed-box inventory from `PACKED` to `OUTBOUND` and writes its own audit trail.
