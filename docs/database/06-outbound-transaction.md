# Outbound Transaction

Outbound packing uses existing inventory rows and outbound box tables:

- `outbound_boxes`
- `outbound_box_items`
- `outbound_box_photos`
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

## Correct Item Transaction

Editing one current-box row is transactional.

The transaction:

1. Rereads the outbound box with items and requires `OPEN` status.
2. Verifies the item belongs to the box and the submitted `expectedBoxUpdatedAt` matches.
3. Conditionally advances the box version so concurrent item or box edits cannot overwrite each other.
4. Updates package tracking, product ID, UPC, and IMEI/Serial on `inventory_items`.
5. Updates the linked `inbound_items` row with the same identity fields.
6. Writes an `OUTBOUND_BOX_UPDATE` audit record using resource type `outbound-box-item` and the
   before/after inventory snapshots.
7. Returns the refreshed box.

The service validates tracking format, active UPC/product mapping, product identity requirements,
and duplicate IMEI/Serial before or during this transaction. Unique-identity conflicts roll back all
changes.

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

1. Acquires a PostgreSQL transaction-scoped advisory lock for the outbound box warehouse.
2. Rereads the outbound box before snapshot after the lock is held.
3. Verifies the box is still `OPEN` and its `updatedAt` still equals the required
   `expectedUpdatedAt` supplied by the client.
4. When a visible name is submitted, uses the service-validated NFKC/whitespace-normalized value and
   compares its case-insensitive key with every non-`VOIDED` box in the warehouse. The service has
   already rejected control or invisible characters and normalized names over 120 characters.
5. Conditionally updates the row by ID, `OPEN` status, and expected update timestamp.
6. Writes an `OUTBOUND_BOX_UPDATE` audit log.
7. Returns the refreshed outbound box.

Box-number sequence lookup and allocation happen only after the create transaction has acquired the
warehouse advisory lock. Create-box name checking uses that same lock and repeats the normalized-name
scan before inserting the box and its `OUTBOUND_BOX_CREATE` audit log. Concurrent creates therefore
cannot receive the same generated box number, and a concurrent create-versus-create or
create-versus-rename attempt cannot commit two non-voided boxes with the same normalized name even
though the schema does not add a separate unique box-name column.

If the expected version is stale or the normalized name is already owned, the transaction writes no
box update and no audit log. The service translates the result to a readable `409 Conflict`.

## Seal Box Transaction

Sealing is the critical phase-ten transaction boundary.

Before the transaction starts, the service verifies that the open box contains at least one item and at least one packing photo or video evidence file.

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
2. Conditionally updates the row only when its current status is still `SEALED`.
3. Changes the outbound box status to `OPEN` and clears `outbound_boxes.sealedAt`.
4. If another transaction already reopened the box, returns a conflict without writing an audit log.
5. Keeps existing outbound box item links and inventory status unchanged.
6. Writes one `OUTBOUND_BOX_REOPEN` audit log for the successful transition.
7. Returns the refreshed open box.

After reopening, operators can add items, remove items, clear the box, edit settings, and seal again. Each follow-up operation writes its own audit log with the current operator.

## Packing Evidence Transactions

Packing photo and video changes are audited against the outbound box.

Uploading an evidence file:

1. Validates that the box is `OPEN`.
2. Validates the file is JPG, PNG, WebP, MP4, MOV, or WebM and 100 MB or smaller.
3. Stores the file under the API upload directory.
4. Creates one `outbound_box_photos` row.
5. Writes an `OUTBOUND_BOX_PHOTO_ADD` audit log with the file metadata.
6. Returns the refreshed outbound box.

Deleting an evidence file:

1. Validates that the box is `OPEN`.
2. Deletes the `outbound_box_photos` row.
3. Writes an `OUTBOUND_BOX_PHOTO_DELETE` audit log.
4. Removes the stored file if it still exists.
5. Returns the refreshed outbound box.

## Current State Choice

Phase ten keeps sealed-box inventory in `PACKED`.

`OUTBOUND` is reserved for a later shipping or final outbound confirmation workflow. That later workflow should use a new transaction that moves sealed-box inventory from `PACKED` to `OUTBOUND` and writes its own audit trail.
