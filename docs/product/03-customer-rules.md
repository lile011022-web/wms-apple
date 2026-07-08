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

## Customer Aliases / Sub-customers

Some customers receive packages under multiple names. The system treats these names as customer
aliases, not independent inventory owners:

- The parent `Customer` is the real inventory, packing, report, and settlement owner.
- A `CustomerAlias` stores one receiving name under the parent customer, for example `A1`, `A2`, or
  `A3` under parent customer `A`.
- Alias codes are unique only within the same parent customer and are normalized to uppercase.
- New inbound drafts may select an active alias after selecting the parent customer.
- Confirmed inbound batches, inbound rows, and inventory rows keep the selected alias for source
  traceability, while `customerId` continues to point to the parent customer.
- Outbound packing still selects the parent customer. Inventory received through any active or
  historical alias under that parent can be packed into the same parent-customer box.
- Detail downloads can filter by parent customer for a full customer file or by alias for an
  A1/A2/A3 sub-customer file.
- Alias creation, profile update, and status changes are customer-management changes and must be
  audited.

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
Alias references on inbound and inventory rows are historical receiving-source markers. If an alias
should no longer be used, deactivate the alias instead of deleting it.

## Audit Rules

Customer creation, profile update, and status change are critical customer-management operations.

Each change must write an audit log with:

- `action`: `CUSTOMER_CHANGE`.
- `operatorId`: current authenticated user.
- `resourceType`: `customer`.
- `resourceId`: changed customer ID.
- Before and after snapshots for updates and status changes.
