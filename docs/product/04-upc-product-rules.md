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
- The UPC product library page provides an import template with `sku`, `name`, `brand`, `model`,
  `modelCode`, `category`, `color`, `capacity`, `requiresImei`, and `upcs` columns.
- Multiple UPC values in one import row are separated with semicolons.

## Export Rules

- The product management page can export the complete product library as `.xlsx`.
- Export reads every product page in batches of 100 and is not limited to the currently visible page.
- One spreadsheet row represents one product; multiple UPC mappings are joined with semicolons.
- The first worksheet is `可重新导入`. It uses the exact import-template headers and `true` / `false`
  values for `requiresImei`, so the exported workbook can be selected directly for batch import.
- The second worksheet is `商品明细`. It keeps Chinese column names and includes product status for
  operational review; status is intentionally excluded from the re-import worksheet because import does not
  change product status.
- Export is read-only and does not change product or audit state.

## Delete Policy

The product management page supports single-row and selected-row deletion, but physical deletion is
allowed only for products that have never entered a business workflow.

Before deleting any selected product, the backend checks references from:

- Inbound items.
- Inventory items.
- Exception records.

Batch deletion is all-or-nothing. If any selected product has one of these references, no selected
product is deleted and the response identifies the blocked SKU and reference counts. When every
selected product is unused, its UPC mappings and product row are deleted in one database transaction.

Historical tables keep product references for:

- Inbound items.
- Inventory items.
- Exception records.
- Outbound and report displays through inventory records.
- Audit logs.

If a product has business history and should no longer be used, deactivate it instead of deleting it.

## Audit Rules

Product creation, profile update, status change, bulk import, and safe deletion are critical
UPC-library operations.

Each change must write an audit log with:

- `action`: `UPC_PRODUCT_CHANGE`.
- `operatorId`: current authenticated user.
- `resourceType`: `product` or `product-import`.
- `resourceId`: changed product ID for single-product changes.
- Before and after snapshots for updates and status changes.
