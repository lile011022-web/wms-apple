# Customer Rules

## Purpose

Customers define ownership for inbound scans, inventory, outbound packing, batch customer changes, and report filters.

## Customer Identity

- Customer code is the stable operational identifier shown in selectors and management tables.
- Customer code must be unique.
- Customer code is normalized to uppercase before storage.
- Customer name is the human-readable business name.
- Customer management table rows can be edited inline. Operators click `编辑`, change customer code
  or name directly in the row, then click `保存` to persist the update.

## Customer Status

- `ACTIVE` customers can be used by new operational workflows.
- `INACTIVE` customers remain available for historical data and reporting.
- New inbound customer selection must use active customers only.
- Future outbound, report, and batch customer-change screens may display inactive customers when reading historical records, but should visually mark them unavailable for new ownership assignment.

## Customer Summary

Customer management shows operational summary values:

- In-stock IMEI count.
- In-stock SKU count.
- Current-month inbound count.
- Current-month outbound count.

These values are derived from inventory, inbound item, and outbound box item records. They are not manually editable customer fields.

## Delete Policy

Customers must not be physically deleted through normal product workflows.

Historical tables keep customer references for:

- Inbound batches and items.
- Inventory items.
- Outbound boxes.
- Exception records.
- Batch customer change logs.
- Audit logs.

If a customer should no longer be used, deactivate the customer instead of deleting it.

## Audit Rules

Customer creation, profile update, and status change are critical customer-management operations.

Each change must write an audit log with:

- `action`: `CUSTOMER_CHANGE`.
- `operatorId`: current authenticated user.
- `resourceType`: `customer`.
- `resourceId`: changed customer ID.
- Before and after snapshots for updates and status changes.
