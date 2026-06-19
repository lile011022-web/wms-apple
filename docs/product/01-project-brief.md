# Project Brief

## Product

WMS Scan is a warehouse management system for Apple product scanning workflows in a US warehouse.

The system manages inbound scanning, customer-owned inventory, outbound packing, exception handling, product UPC mapping, customer management, reporting, and audit logs.

## Core Business Rules

1. Inbound operations must select and lock a customer before scanning.
2. Package tracking numbers (UPS, USPS, or FedEx), UPC, IMEI, and Serial values are always bound to the currently locked customer during inbound scanning.
3. Outbound operations must not reassign customers. Operators can only scan or select IMEI records from the current customer's inventory for packing.
4. UPC is used to match records in the product catalog.
5. IMEI is the core tracking ID for item-level inventory.
6. Batch customer changes must preserve modification logs, including before value, after value, operator, timestamp, reason, and affected records.
7. All critical operations must be auditable.

## Critical Audited Operations

- Login and logout
- Inbound confirmation
- Outbound box sealing
- Exception handling
- Batch customer changes
- UPC product changes
- Customer changes
- User, role, and permission changes
- System setting changes
- Report exports
