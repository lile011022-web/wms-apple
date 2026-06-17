# Entity Relationship

## Purpose

This document records the phase 2 core database model for WMS Scan. The Prisma schema lives in:

```text
apps/api/prisma/schema.prisma
```

The model is designed to support the current prototype pages without implementing every API endpoint at once.

## Identity And Access

- `User`: operator account. Stores email, display name, password hash, status, and last login time.
- `Role`: named role such as `ADMIN`.
- `Permission`: stable permission code such as `inbound.manage`.
- `UserRoleAssignment`: many-to-many join between users and roles.
- `RolePermission`: many-to-many join between roles and permissions.

Controllers and guards should later resolve authorization from `User -> Role -> Permission`.

## Warehouse And Customer Master Data

- `Warehouse`: warehouse code, name, timezone, active state, and relationships to inbound, inventory, outbound, and exceptions.
- `Customer`: customer code, customer name, contact data, status, notes, and relationships to inbound, inventory, outbound, exceptions, and batch change logs.

Inbound and outbound flows must reference a customer by ID. Outbound code must not change customer ownership during packing.

## Product And UPC Library

- `Product`: Apple product master record, including SKU, model, color, capacity, and whether IMEI is required.
- `ProductUpc`: unique UPC mapping to a product.

`ProductUpc.upc` is globally unique. A UPC scan should resolve through `ProductUpc` before an inbound item can be confirmed as normal inventory.

## Inbound And Inventory

- `InboundBatch`: one confirmed inbound operation, locked to a customer, warehouse, and operator.
- `InboundItem`: scanned UPS, UPC, IMEI, and Serial detail row under an inbound batch.
- `InventoryItem`: item-level inventory record for customer-owned stock.

Important constraints:

- `InventoryItem.imei` is unique when present.
- `InventoryItem.serial` is unique when present.
- `InboundItem.inventoryItemId` is unique, preserving a one-to-one link from inbound detail to inventory detail when the scan becomes stock.
- `InventoryItem.status` is indexed by customer, warehouse, and product so customer inventory and outbound picking pages can query quickly.

## Outbound

- `OutboundBox`: customer and warehouse scoped shipping box.
- `OutboundBoxItem`: packed inventory item inside a box.

Important constraints:

- `OutboundBox` is unique by `warehouseId + boxNo`.
- `OutboundBoxItem.inventoryItemId` is unique so one inventory item cannot be packed into multiple active box detail rows.

Service code must still validate customer ownership and item status inside a database transaction before sealing a box.

## Exceptions

- `ExceptionRecord`: centralized exception pool for UPC missing, duplicated IMEI, duplicated UPS, customer mismatch, and IMEI not in stock.

Exception records can point to customer, warehouse, product, inbound item, or inventory item when that context is known. `beforeSnapshot` and `afterSnapshot` capture handling context for review.

## Batch Customer Changes

- `CustomerChangeLog`: immutable log for batch customer correction.

Each log stores old customer, new customer, operator, reason, affected count, affected item IDs, and optional before/after snapshots. Business code must create this log in the same transaction as the ownership correction.

## Reports, Audit, And Settings

- `ReportExport`: export job history and status.
- `AuditLog`: append-only audit event store for critical operations.
- `SystemSetting`: key/value settings for scan rules, warehouse defaults, retention policies, and future operational configuration.

`AuditLog` should be written for every product-brief critical operation.
