# Exception APIs

## Scope

Phase eleven adds exception-pool lookup and handling APIs for the Exception Pool page, with summary data for Dashboard and scan workflow indicators.

Current controllers require `exceptions.manage`.

## List Exceptions

`GET /api/v1/exceptions`

Query parameters:

- `page`, `pageSize`, `search`, `sortBy`, `sortOrder`
- `type`: `UPC_NOT_MATCHED`, `IMEI_DUPLICATED`, `UPS_DUPLICATED`, `CUSTOMER_OWNERSHIP_MISMATCH`, `IMEI_NOT_INBOUNDED`
- `status`: `OPEN`, `RESOLVED`, `IGNORED`, `INVALID`
- `customerId`
- `warehouseId`

Search matches raw value, UPS, UPC, IMEI, Serial, customer code/name, and product SKU/name.

## Summary

`GET /api/v1/exceptions/summary`

Returns total count, open total, counts by exception type, and counts by status. The endpoint accepts the same customer, warehouse, type, and search filters as list. Status is intentionally ignored so tab counts remain complete for the current filter scope.

## Detail

`GET /api/v1/exceptions/:id`

Returns the exception record, display title, customer, warehouse, product, linked inbound item, linked inventory item, latest outbound box context, resolution fields, snapshots, and timestamps.

## Resolve

`POST /api/v1/exceptions/:id/resolve`

```json
{
  "resolutionNote": "Confirmed against package photo and linked to the correct record."
}
```

Rules:

- `resolutionNote` is required.
- Only `OPEN` exceptions can be resolved.
- The API stores `RESOLVED`, `resolvedById`, `resolvedAt`, and the note.
- A successful action writes an `EXCEPTION_HANDLE` audit log.

## Ignore

`POST /api/v1/exceptions/:id/ignore`

```json
{
  "resolutionNote": "Duplicate package was confirmed as expected for this receiving lane."
}
```

Rules match resolve, but the final status is `IGNORED`.

## Invalidate

`POST /api/v1/exceptions/:id/invalidate`

```json
{
  "resolutionNote": "Record was created by a test scan and is not operational."
}
```

Rules match resolve, but the final status is `INVALID`.

## Batch Resolve

`POST /api/v1/exceptions/batch-resolve`

```json
{
  "ids": ["exception-1", "exception-2"],
  "resolutionNote": "Reviewed selected exceptions and confirmed the handling decision."
}
```

Returns:

```json
{
  "requestedCount": 2,
  "processedCount": 1,
  "failedCount": 1,
  "results": [
    { "id": "exception-1", "success": true, "exception": {} },
    { "id": "exception-2", "success": false, "error": "Only open exceptions can be handled." }
  ]
}
```

Each ID is handled independently. Successful rows write their own `EXCEPTION_HANDLE` audit log.

## Batch Ignore

`POST /api/v1/exceptions/batch-ignore`

The request and response shape match batch resolve, but successful rows move to `IGNORED`.
