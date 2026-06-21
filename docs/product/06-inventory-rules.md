# Inventory Rules

Inventory rows are customer-owned item records created by confirmed inbound scans.

## Ownership

- Inventory always belongs to the customer selected and locked during inbound scanning.
- Customer inventory pages must query by `customerId`.
- Outbound packing must only offer inventory from the selected customer.
- Outbound packing must not reassign the customer of an inventory row.

## Status Meaning

- `IN_STOCK`: available warehouse inventory. This is the only status selectable for outbound packing.
- `PACKED`: added to an open or sealed outbound box, but not yet final outbound inventory.
- `OUTBOUND`: shipped or finalized outbound inventory.
- `EXCEPTION`: blocked by a business exception and requires exception handling before normal operation.
- `VOIDED`: retained for history but excluded from normal operational counts.

## SKU Summary

Product-level inventory summaries are derived from `inventory_items` grouped by `productId` and `status`.

The customer inventory page should show:

- Customer-level totals for total inventory, SKU count, in-stock, available outbound, packed, outbound, exception, and voided quantities.
- SKU and product identity from the product catalog.
- Count of distinct related package tracking numbers for that SKU. In the customer inventory page, `单号` means the inbound logistics number stored as `upsTrackingNo`, but SKU summary rows show only the count instead of listing every tracking number.
- Total quantity.
- In-stock quantity.
- Packed quantity.
- Outbound quantity.
- Exception quantity.
- Available-for-outbound quantity.

## IMEI And Serial Details

IMEI is the primary tracking identifier for Apple products that require IMEI. Serial is used when a valid product does not require IMEI or when operationally needed.

Detail rows should preserve:

- Inbound batch number.
- Package tracking/order number captured during inbound scanning.
- Latest outbound box/order number when the item has already been packed or outbound.
- UPC.
- UPS tracking number.
- IMEI or Serial.
- Customer.
- Warehouse.
- Product.
- Inbound batch.
- Current inventory status.
- Latest outbound box when packed or outbound.
- Exception summary.

## Outbound Availability

Only `IN_STOCK` rows are available for outbound packing.

Rows with `EXCEPTION`, `PACKED`, `OUTBOUND`, or `VOIDED` status must not appear as selectable inventory in outbound packing.

## Customer Inventory Page Boundary

The left navigation customer inventory page is for viewing customer-owned inventory only. It should not create boxes, select boxes, seal boxes, or expose batch packing controls.

Batch packing belongs to the outbound packing workbench, where the selected customer inventory panel can add one or many available rows to the active outbound box.

## Export Behavior

Inventory export filters must match inventory list filters so the detail download page and reports module do not drift from on-screen inventory results.
