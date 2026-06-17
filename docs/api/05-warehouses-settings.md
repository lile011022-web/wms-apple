# Warehouses And System Settings API

## Purpose

These endpoints power the System Settings warehouse, scan rule, exception handling, notification, and data retention sections.

All endpoints require:

```text
Authorization: Bearer <accessToken>
```

Current phase-four controllers require `settings.manage`.

## GET /warehouses

Lists warehouses for system configuration and default warehouse selection.

Query parameters:

- `search`: optional code, name, or address search.
- `isActive`: optional `true` or `false`.

Response `data`:

```json
[
  {
    "id": "warehouse_id",
    "code": "US-LAX-01",
    "name": "US Los Angeles Warehouse",
    "address": "Los Angeles, CA",
    "timezone": "America/Los_Angeles",
    "isActive": true,
    "createdAt": "2026-06-17T00:00:00.000Z",
    "updatedAt": "2026-06-17T00:00:00.000Z"
  }
]
```

## POST /warehouses

Creates a warehouse.

Request:

```json
{
  "code": "US-LAX-01",
  "name": "US Los Angeles Warehouse",
  "address": "Los Angeles, CA",
  "timezone": "America/Los_Angeles",
  "isActive": true
}
```

Business rules:

- `code` is normalized to uppercase and must be unique.
- `timezone` defaults to `America/Los_Angeles`.
- `isActive` defaults to `true`.
- Creation writes an `AuditLog` with action `SYSTEM_SETTING_CHANGE`.

## PATCH /warehouses/:id

Updates warehouse profile fields.

Request fields are optional:

```json
{
  "name": "US Los Angeles Warehouse",
  "address": "Updated address",
  "isActive": false
}
```

Business rules:

- Unknown warehouse IDs return `RESOURCE_NOT_FOUND`.
- Changing `code` is allowed only when the new code is unique.
- Update writes an `AuditLog` with action `SYSTEM_SETTING_CHANGE`.

## GET /settings

Returns grouped system settings.

Response `data`:

```json
{
  "warehouse": {
    "defaultWarehouseId": "warehouse_id"
  },
  "scanRules": {
    "requiresLockedCustomer": true,
    "enforceOutboundCustomerOwnership": true,
    "detectDuplicateImei": true,
    "detectDuplicateUps": true
  },
  "exceptionHandling": {
    "createUnmatchedUpcException": true,
    "createDuplicateImeiException": true,
    "createDuplicateUpsException": true
  },
  "notifications": {
    "exceptionEmailEnabled": false,
    "reportExportEmailEnabled": false
  },
  "retention": {
    "auditLogRetentionDays": 365,
    "reportExportRetentionDays": 30,
    "exceptionRecordRetentionDays": 730
  }
}
```

## PATCH /settings

Updates one or more grouped setting fields.

Request:

```json
{
  "scanRules": {
    "requiresLockedCustomer": true,
    "enforceOutboundCustomerOwnership": true,
    "detectDuplicateImei": true,
    "detectDuplicateUps": true
  },
  "retention": {
    "auditLogRetentionDays": 365,
    "reportExportRetentionDays": 30,
    "exceptionRecordRetentionDays": 730
  }
}
```

Business rules:

- At least one setting field is required.
- `warehouse.defaultWarehouseId` must reference an existing warehouse.
- Retention day values must be integers from `1` to `3650`.
- Update writes an `AuditLog` with action `SYSTEM_SETTING_CHANGE`, before/after snapshots, and changed setting keys.

## Stable Setting Keys

The API returns grouped settings, while the database stores stable keys:

- `warehouse.defaultId`
- `scan.inbound.requiresLockedCustomer`
- `scan.outbound.enforceCustomerOwnership`
- `scan.duplicateDetection.imei`
- `scan.duplicateDetection.ups`
- `exceptions.autoCreateForUnmatchedUpc`
- `exceptions.autoCreateForDuplicateImei`
- `exceptions.autoCreateForDuplicateUps`
- `notifications.exceptionEmailEnabled`
- `notifications.reportExportEmailEnabled`
- `retention.auditLogDays`
- `retention.reportExportDays`
- `retention.exceptionRecordDays`
