# Exception Rules

## Purpose

The exception pool centralizes scan and inventory issues that require operator review before the affected record can continue through normal warehouse workflows.

## Exception Types

- `UPC_NOT_MATCHED`: the scanned UPC cannot be matched to an active product UPC mapping.
- `IMEI_DUPLICATED`: the scanned IMEI or Serial already exists on another inventory item.
- `UPS_DUPLICATED`: the UPS tracking number already appears on confirmed inbound records.
- `CUSTOMER_OWNERSHIP_MISMATCH`: the record is tied to a customer that does not match the attempted workflow owner.
- `IMEI_NOT_INBOUNDED`: outbound or inventory work referenced an IMEI that was not received into inventory.

## Status Rules

- `OPEN`: the exception is waiting for manual review.
- `RESOLVED`: an operator confirmed the issue has been handled.
- `IGNORED`: an operator intentionally ignored the exception while preserving the record.
- `INVALID`: an operator marked the exception itself as invalid or no longer applicable.

Only `OPEN` exceptions can be handled. Resolved, ignored, and invalid exceptions are immutable through normal exception handling endpoints.

## Handling Rules

- Resolve, ignore, and invalidate actions require a handling note.
- Handling stores the operator ID, handling timestamp, final status, and resolution note on the exception record.
- Handling writes an `EXCEPTION_HANDLE` audit log with before and after snapshots.
- Batch resolve and batch ignore process each exception independently and return one result per requested ID.
- A failed item in a batch must not prevent other open exceptions from being handled.

## Source Rules

- Inbound UPC preview can create `UPC_NOT_MATCHED`.
- Inbound duplicate identity checks can create `IMEI_DUPLICATED`.
- Inbound confirmation can create `UPS_DUPLICATED` for prior confirmed UPS values.
- Customer ownership and not-inbounded IMEI exceptions are reserved for workflows that detect cross-customer or missing-inventory references.

## UI Usage

The exception pool page should use `GET /exceptions/summary` for tab counts, `GET /exceptions` for the table, `GET /exceptions/:id` for the detail panel, and handling endpoints for row actions.
