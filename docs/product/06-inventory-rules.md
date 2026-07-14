# Inventory Rules

Inventory rows are customer-owned item records created by confirmed inbound scans.

## Ownership

- Inventory always belongs to the customer selected and locked during inbound scanning.
- Customer inventory pages may query one selected `customerId` or all customers for lookup. When
  all customers are shown, every SKU and IMEI/detail row must display the customer code/name so
  operators can identify ownership without opening each customer separately.
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
- A business-time locator so operators can review a selected start/end time window, including today's current inventory activity, packed items, and outbound items without leaving the customer inventory page.
- SKU and product identity from the product catalog.
- Count of distinct related package tracking numbers for that SKU. In the customer inventory page, `单号` means the inbound logistics number stored as `upsTrackingNo`, but SKU summary rows show only the count instead of listing every tracking number.
- Total quantity.
- In-stock quantity.
- Packed quantity.
- Outbound quantity.
- Exception quantity.
- Available-for-outbound quantity.
- Customer code/name on SKU rows, especially when the filter is set to all customers.

Customer-level summary cards are operational drill-down buttons:

- Clicking total inventory or SKU count shows all SKU and IMEI detail rows for the selected customer, warehouse, and optional business date.
- Clicking in-stock or available outbound shows `IN_STOCK` rows.
- Clicking packed shows `PACKED` rows.
- Clicking outbound shows `OUTBOUND` rows.
- Clicking exception or voided shows the matching blocked or cleanup rows.
- The click should reset SKU/detail pagination and move the operator to the matching detail data.

When a business time range is selected, date filters are status-aware:

- `PACKED` rows use `packedAt`.
- `OUTBOUND` rows use `outboundAt`.
- `IN_STOCK`, `EXCEPTION`, and `VOIDED` rows use `receivedAt`.

This keeps "today packed" and "today outbound" aligned with the actual warehouse action instead of the original inbound date.

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
- Force-inbound marker, force reason, and force time from the linked inbound item. The customer
  inventory table labels the reason as `补货留言`, so operational notes such as `chen补给JH`
  are visible to data staff.
- Customer code/name as a first-class visible column so cross-customer searches remain identifiable.

The customer inventory detail table should provide a search box for narrowing item rows without
leaving the page. Search should use the inventory item list API's broad `search` filter so operators
can find rows by customer code/name, package tracking number, IMEI, Serial, UPC, SKU, or product name
while preserving the selected customer and warehouse filters when a customer is selected. The search
should also cover inbound batch number and latest outbound box number/name because those columns are
visible in the detail table. Force-inbound reasons are searchable as well.

The customer inventory detail table should provide a direct `导出明细` action. The export must use
the current customer, warehouse, business time range, status card, and detail search filters so downloaded
rows match the on-screen detail table. When the current view is all customers, exported rows must
include customer code/name. The exported table must include `入库时间` so operators can audit how
long visible inventory has stayed in the warehouse.

## Outbound Availability

Only `IN_STOCK` rows are available for outbound packing.

Rows with `EXCEPTION`, `PACKED`, `OUTBOUND`, or `VOIDED` status must not appear as selectable inventory in outbound packing.

## Customer Inventory Page Boundary

The left navigation customer inventory page is for viewing and cleaning customer-owned inventory
details. It should not create boxes, select boxes, seal boxes, expose batch packing controls, or
delete product catalog UPC/SKU data.

The IMEI/detail inventory table may expose destructive cleanup controls:

- Operators can select one or more visible inventory detail rows and delete those exact customer
  inventory rows.
- Operators can delete all detail rows in the current detail page.
- Operators can delete one SKU summary row after selecting a customer. This deletes only the
  inventory rows matching the current customer, warehouse, status, date range, and SKU row; it does
  not delete UPC/SKU/product catalog data.
- Deletion requires a selected customer; all-customer lookup views remain read-only for destructive
  cleanup.
- Deletion must show a confirmation prompt before calling the API.
- Deletion removes matching `inventory_items` rows and clears linked inbound-item and exception
  inventory pointers.
- Deletion must reject packed or outbound rows; operators must resolve outbound box associations in
  the outbound workflow first.
- Deletion does not delete customer records, products, product UPCs, inbound batches, or inbound item
  history.
- Deletion must be audit logged with the selected customer, warehouse, inventory item IDs, and
  deleted count.

Batch packing belongs to the outbound packing workbench, where the selected customer inventory panel
can add one or many available rows to the active outbound box. All-customer inventory views are for
lookup and ownership identification; destructive cleanup and outbound packing still require a
specific selected customer.

## Export Behavior

Inventory export filters must match inventory list filters so the detail download page and reports module do not drift from on-screen inventory results.
Customer inventory page shortcut exports should use the report export workflow so downloads remain
audited through `REPORT_EXPORT`.
