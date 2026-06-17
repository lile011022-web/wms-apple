# UPC Product Rules

## Purpose

The UPC product library maps scanned UPC values to Apple product master data.

Inbound scanning depends on this library to identify product SKU, model, color, capacity, and whether the scanned item requires IMEI capture.

## Product Identity

- SKU is the stable operational product identifier.
- SKU must be unique and is normalized to uppercase before storage.
- A product can have one or more UPC mappings.
- UPC values must be globally unique.
- UPC values use the shared UPC validator and must be numeric.

## Product Status

- `ACTIVE` products and active UPC mappings can be used for new inbound UPC recognition.
- `INACTIVE` products and UPC mappings remain available for historical records and reporting.
- New inbound scans must not resolve inactive products or inactive UPC mappings.

## IMEI Requirement

- `requiresImei = true` means future inbound scanning must require a valid IMEI before confirming item-level inventory.
- `requiresImei = false` allows future inbound logic to accept Serial-based or quantity-oriented rules where product operations permit them.
- Phase six stores the flag and exposes it through UPC lookup. The actual inbound enforcement belongs to phase seven.

## Import Rules

- Import rows must obey the same SKU and UPC uniqueness rules as manual creation.
- Duplicate SKU or UPC values within the import request are rejected.
- Existing SKU or UPC conflicts are rejected before any product row is created.

## Delete Policy

Products and UPC mappings must not be physically deleted through normal product workflows.

Historical tables keep product references for:

- Inbound items.
- Inventory items.
- Exception records.
- Outbound and report displays through inventory records.
- Audit logs.

If a product should no longer be used, deactivate the product instead of deleting it.

## Audit Rules

Product creation, profile update, status change, and bulk import are critical UPC-library operations.

Each change must write an audit log with:

- `action`: `UPC_PRODUCT_CHANGE`.
- `operatorId`: current authenticated user.
- `resourceType`: `product` or `product-import`.
- `resourceId`: changed product ID for single-product changes.
- Before and after snapshots for updates and status changes.
