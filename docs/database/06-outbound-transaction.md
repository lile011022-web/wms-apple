# Outbound Transaction

Outbound packing uses existing inventory rows and outbound box tables:

- `outbound_boxes`
- `outbound_box_items`
- `inventory_items`
- `audit_logs`

## Add Item Transaction

Adding an item to a box is transactional.

The transaction:

1. Creates one `outbound_box_items` row.
2. Updates the linked `inventory_items` row to `PACKED`.
3. Sets `inventory_items.packedAt`.
4. Returns the refreshed outbound box.

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

1. Deletes the `outbound_box_items` row.
2. Updates the linked `inventory_items` row back to `IN_STOCK`.
3. Clears `inventory_items.packedAt`.
4. Returns the refreshed outbound box.

Sealed boxes cannot be changed by the current outbound service.

## Clear Box Transaction

Clearing an open box is transactional.

The transaction:

1. Deletes all `outbound_box_items` rows for the box.
2. Updates affected `PACKED` inventory rows back to `IN_STOCK`.
3. Clears `packedAt`.
4. Returns the cleared count and refreshed outbound box.

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

## Current State Choice

Phase ten keeps sealed-box inventory in `PACKED`.

`OUTBOUND` is reserved for a later shipping or final outbound confirmation workflow. That later workflow should use a new transaction that moves sealed-box inventory from `PACKED` to `OUTBOUND` and writes its own audit trail.
