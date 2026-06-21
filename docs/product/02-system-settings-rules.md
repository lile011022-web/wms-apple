# System Settings Rules

## Purpose

System Settings controls warehouse profile data and operational switches that later inbound, inventory, outbound, exception, report, and audit workflows must read.

## Warehouse Rules

- Warehouse code identifies an operational warehouse and must be unique.
- Warehouse code is normalized to uppercase.
- Inactive warehouses should remain available for historical records, but should not be offered as the default choice for new operations in future workflow screens.
- The default warehouse is stored as `warehouse.defaultId` and must reference an existing warehouse.
- Authenticated operational users may read warehouse choices for inbound and outbound workflows; creating or editing warehouse records remains a system settings action.

## Scan Rules

- `scan.inbound.requiresLockedCustomer` controls whether inbound scans require a locked customer before UPS, UPC, IMEI, or Serial input is accepted.
- `scan.outbound.enforceCustomerOwnership` controls whether outbound packing blocks inventory that does not belong to the selected customer.
- `scan.duplicateDetection.imei` controls duplicate IMEI detection.
- `scan.duplicateDetection.ups` controls duplicate UPS tracking number detection.

These switches are system-level controls. Future inbound and outbound services must read them before accepting scan state changes.

## Exception Handling Rules

- `exceptions.autoCreateForUnmatchedUpc` controls whether unmatched UPC scans create exception records.
- `exceptions.autoCreateForDuplicateImei` controls whether duplicated IMEI scans create exception records.
- `exceptions.autoCreateForDuplicateUps` controls whether duplicated UPS scans create exception records.

Turning off automatic exception creation does not remove validation requirements. Future business services may still block invalid operations when product rules require blocking.

## Notification Rules

- `notifications.exceptionEmailEnabled` controls exception notification email delivery.
- `notifications.reportExportEmailEnabled` controls report export completion or failure email delivery.

Notification settings only define intent in the current phase. Actual delivery jobs belong to later report and notification implementation work.

## Data Retention Rules

- `retention.auditLogDays` controls audit log retention days.
- `retention.reportExportDays` controls report export file and history retention days.
- `retention.exceptionRecordDays` controls exception record retention days.
- Retention values must be whole days from `1` to `3650`.

Retention settings must be read by future cleanup jobs before deleting or expiring data.

## Audit Rules

Warehouse creation, warehouse update, and system setting update are critical system changes.

Each change must write an audit log with:

- `action`: `SYSTEM_SETTING_CHANGE`.
- `operatorId`: current authenticated user.
- `resourceType`: `warehouse` or `system-settings`.
- Before and after snapshots when updating existing values.
- Changed setting keys for grouped system setting updates.
