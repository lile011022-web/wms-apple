# Inventory State Machine

## Inventory Statuses

`InventoryItem.status` uses these values:

```text
IN_STOCK -> PACKED -> OUTBOUND
IN_STOCK -> EXCEPTION
PACKED -> EXCEPTION
IN_STOCK -> VOIDED
PACKED -> VOIDED
EXCEPTION -> IN_STOCK
EXCEPTION -> VOIDED
```

## Status Meaning

- `IN_STOCK`: item has been confirmed inbound and can be shown in customer inventory or selected for outbound packing.
- `PACKED`: item has been added to an outbound box that is not fully completed as outbound history yet.
- `OUTBOUND`: item has left inventory after box sealing or outbound confirmation.
- `EXCEPTION`: item is blocked by an exception and should not be packed.
- `VOIDED`: item was invalidated or canceled and must not participate in normal inventory or outbound flows.

## Required Transaction Rules

Inbound confirmation must run in one transaction:

1. Create `InboundBatch`.
2. Create `InboundItem` rows.
3. Create `InventoryItem` rows for valid stock.
4. Create `ExceptionRecord` rows for invalid scans.
5. Create an `AuditLog` with action `INBOUND_CONFIRM`.

Outbound packing and sealing must run in one transaction:

1. Confirm every inventory item belongs to the outbound box customer.
2. Confirm every inventory item is currently `IN_STOCK`.
3. Create `OutboundBoxItem` rows.
4. Move inventory items to `PACKED`.
5. On seal, move packed items to `OUTBOUND`.
6. Create an `AuditLog` with action `OUTBOUND_BOX_SEAL`.

Exception handling must run in one transaction:

1. Load the open `ExceptionRecord`.
2. Apply the selected handling action.
3. Update affected `InboundItem` or `InventoryItem` state.
4. Store before and after snapshots.
5. Create an `AuditLog` with action `EXCEPTION_HANDLE`.

Batch customer changes must run in one transaction:

1. Validate the affected item set.
2. Update customer ownership on approved rows.
3. Create `CustomerChangeLog`.
4. Create an `AuditLog` with action `CUSTOMER_BATCH_CHANGE`.

## Query Guidance

- Customer inventory pages should filter `InventoryItem` by `customerId` and status.
- Outbound packing should only load `InventoryItem` rows where `customerId` matches the selected customer and `status = IN_STOCK`.
- Exception pool pages should filter `ExceptionRecord` by `status`, `type`, `customerId`, UPC, or IMEI.
