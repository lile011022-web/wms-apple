# Dashboard and Audit Logs API

Phase fourteen adds dashboard metrics and audit-log lookup.

Base paths:

- `/api/v1/dashboard`
- `/api/v1/audit-logs`

Permissions:

- Dashboard endpoints require `dashboard.read`.
- Audit log endpoints require `audit-logs.read`.

## Dashboard Summary

`GET /dashboard/summary`

Optional query:

- `warehouseId`

Returns:

```json
{
  "todayInboundCount": 18,
  "todayOutboundBoxCount": 4,
  "inStockTotal": 328,
  "pendingExceptionCount": 3,
  "generatedAt": "2026-06-18T10:30:00.000Z"
}
```

## Dashboard Trends

`GET /dashboard/trends`

Optional query:

- `warehouseId`

Returns the most recent seven UTC calendar days, including today:

```json
{
  "days": [
    {
      "date": "2026-06-12",
      "inboundCount": 4,
      "outboundBoxCount": 1
    }
  ],
  "generatedAt": "2026-06-18T10:30:00.000Z"
}
```

## Exception Distribution

`GET /dashboard/exception-distribution`

Optional query:

- `warehouseId`

Returns open exceptions grouped by type:

```json
{
  "items": [
    {
      "type": "IMEI_DUPLICATED",
      "count": 2
    }
  ],
  "generatedAt": "2026-06-18T10:30:00.000Z"
}
```

## Top Inbound Customers

`GET /dashboard/top-inbound-customers`

Optional query:

- `warehouseId`

Returns the top five customers by confirmed inbound item count today:

```json
{
  "items": [
    {
      "customerId": "cust_01H...",
      "customerCode": "CUST-001",
      "customerName": "Apple Demo Customer",
      "inboundCount": 5
    }
  ],
  "generatedAt": "2026-06-18T10:30:00.000Z"
}
```

## Recent Audit Logs

`GET /audit-logs/recent`

Returns the latest 10 audit events:

```json
{
  "items": [
    {
      "id": "audit_01H...",
      "action": "INBOUND_CONFIRM",
      "resourceType": "inbound_batch",
      "resourceId": "batch_01H...",
      "operator": {
        "id": "user_01H...",
        "email": "operator@wms-scan.local",
        "name": "Operator"
      },
      "requestId": "req_01H...",
      "ipAddress": "127.0.0.1",
      "userAgent": "Mozilla/5.0",
      "beforeSnapshot": null,
      "afterSnapshot": {
        "status": "CONFIRMED"
      },
      "metadata": {
        "confirmedItemCount": 2
      },
      "createdAt": "2026-06-18T10:30:00.000Z"
    }
  ]
}
```

## Audit Log Search

`GET /audit-logs`

Query parameters:

- `page`
- `pageSize`
- `search`
- `sortBy`: `createdAt`, `action`, or `resourceType`
- `sortOrder`: `asc` or `desc`
- `action`
- `resourceType`
- `resourceId`
- `operatorId`
- `requestId`
- `dateFrom`
- `dateTo`

Returns:

```json
{
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "items": []
}
```

The response item shape matches `GET /audit-logs/recent`.
