# Customers API

## Purpose

These endpoints power customer management and customer selectors used by inbound scanning, customer inventory, outbound packing, batch customer changes, and report filters.

All endpoints require:

```text
Authorization: Bearer <accessToken>
```

Current phase-five controllers require `customers.manage`.

## GET /customers

Lists customers with pagination, search, status filtering, and operational summary counts.

Query parameters:

- `page`: page number, defaults to `1`.
- `pageSize`: page size, defaults to `20`, maximum `100`.
- `search`: optional customer code, name, contact name, or contact info search.
- `status`: optional `ACTIVE` or `INACTIVE`.
- `sortBy`: optional `createdAt`, `updatedAt`, `code`, `name`, or `status`.
- `sortOrder`: optional `asc` or `desc`, defaults to `desc`.

Response `data`:

```json
{
  "items": [
    {
      "id": "customer_id",
      "code": "CUST-001",
      "name": "TechFlow Inc.",
      "contactName": "John Smith",
      "contactInfo": "john@techflow.com",
      "status": "ACTIVE",
      "notes": null,
      "createdAt": "2026-06-17T00:00:00.000Z",
      "updatedAt": "2026-06-17T00:00:00.000Z",
      "summary": {
        "inStockImeiCount": 4892,
        "skuCount": 47,
        "monthlyInboundCount": 1284,
        "monthlyOutboundCount": 892
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 18
}
```

## GET /customers/options

Returns compact customer selector data for other workflow pages.

Query parameters:

- `search`: optional customer code or name search.
- `includeInactive`: optional boolean. Defaults to active customers only.

Response `data`:

```json
[
  {
    "id": "customer_id",
    "code": "CUST-001",
    "name": "TechFlow Inc.",
    "status": "ACTIVE",
    "label": "CUST-001 - TechFlow Inc.",
    "disabled": false
  }
]
```

Business rules:

- Inactive customers are excluded by default.
- When inactive customers are explicitly included, the API marks them as `disabled` so new inbound workflows can block selection.

## GET /customers/:id

Returns one customer profile.

Unknown customer IDs return `RESOURCE_NOT_FOUND`.

## POST /customers

Creates a customer.

Request:

```json
{
  "code": "CUST-001",
  "name": "TechFlow Inc.",
  "contactName": "John Smith",
  "contactInfo": "john@techflow.com",
  "status": "ACTIVE",
  "notes": "Preferred inbound customer for phone inventory."
}
```

Business rules:

- `code` is normalized to uppercase and must be unique.
- `status` defaults to `ACTIVE`.
- Creation writes an `AuditLog` with action `CUSTOMER_CHANGE`.

## PATCH /customers/:id

Updates customer profile fields.

Request fields are optional:

```json
{
  "name": "TechFlow Inc.",
  "contactName": "Warehouse Ops",
  "contactInfo": "ops@techflow.com",
  "notes": "Updated customer contact."
}
```

Business rules:

- Unknown customer IDs return `RESOURCE_NOT_FOUND`.
- Changing `code` is allowed only when the new normalized code is unique.
- Update writes an `AuditLog` with action `CUSTOMER_CHANGE`.

## PATCH /customers/:id/status

Activates or deactivates a customer.

Request:

```json
{
  "status": "INACTIVE"
}
```

Business rules:

- Deactivated customers remain available for historical records.
- Deactivated customers must not be offered as selectable customers for new inbound work.
- Status changes write an `AuditLog` with action `CUSTOMER_CHANGE`.

## GET /customers/:id/summary

Returns operational summary counts for one customer.

Response `data`:

```json
{
  "inStockImeiCount": 4892,
  "skuCount": 47,
  "monthlyInboundCount": 1284,
  "monthlyOutboundCount": 892
}
```

Summary definitions:

- `inStockImeiCount`: `IN_STOCK` inventory rows with an IMEI for this customer.
- `skuCount`: distinct in-stock product count for this customer.
- `monthlyInboundCount`: confirmed inbound item count scanned from the first day of the current month.
- `monthlyOutboundCount`: outbound box item count packed from the first day of the current month.

## Delete Policy

There is intentionally no physical delete endpoint in phase five.

Customers are historical owners for inbound items, inventory, outbound boxes, exceptions, customer change logs, and audit records. Use `PATCH /customers/:id/status` to deactivate instead.
