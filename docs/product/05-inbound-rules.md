# Inbound Rules

## Purpose

Inbound scanning receives Apple products into customer-owned warehouse inventory.

The customer must be locked before scan data becomes operational inventory. Package tracking numbers, UPC, IMEI, and Serial values captured in the draft belong to that locked customer.

## Customer Lock

- New inbound drafts require an active customer when the locked-customer setting is enabled.
- Operators cannot change the customer on an existing draft.
- If a customer assignment was wrong after confirmation, later phases must use the batch customer change workflow and keep change logs.

## UPC Matching

- UPC values are normalized and validated with the shared UPC validator.
- Only active UPC mappings that point to active products can be used for normal inbound preview rows.
- Unmatched UPC values are saved as exception preview rows and can create `UPC_NOT_MATCHED` exception records.

## IMEI And Serial

- IMEI is the preferred single-item tracking ID for Apple devices.
- Products with `requiresImei = true` must provide a valid IMEI.
- Products with `requiresImei = false` can use Serial or IMEI in the current phase.
- A preview item cannot provide both IMEI and Serial.
- Duplicate IMEI or Serial values are exception conditions and must not create normal inventory.

## Package Tracking

- UPS, USPS, and FedEx tracking values are validated independently and can also be attached to each preview item.
- The current API and database field remains `upsTrackingNo` for compatibility, but the business meaning is package tracking number.
- Multiple items may share one package tracking number within the same package.
- A package tracking value already confirmed in prior inbound records is treated as a duplicate package signal and can create `UPS_DUPLICATED` exceptions.

## Confirmation

Confirmation is the point where preview data becomes inventory.

Before confirmation, the inbound scan page should show an always-current review summary for the
active draft. The summary must help the operator verify the number of scanned product units, unique
UPC values, product styles, package tracking numbers, pending rows, exception rows, and the count
per UPC/product.

The system must:

- Recheck duplicates inside the transaction.
- Create inventory only for valid preview rows.
- Mark duplicate rows as exceptions instead of creating inventory.
- Link confirmed inbound items to the created inventory items.
- Write an `INBOUND_CONFIRM` audit log.

## Delete Policy

Inbound preview deletion is logical during the draft lifecycle. Removed rows are marked `VOIDED`.

Confirmed inbound records and inventory rows must not be physically deleted by normal inbound workflows.

## Scan Entry Automation

When a customer is locked and the package tracking number, UPC, and IMEI fields are all filled, the
web page can automatically add the row to the current draft after the input stabilizes. The manual
add action should remain available as a fallback. The final confirmation must still require an
operator click so the review summary can be checked first.

## Batch File Import

Inbound operators can import a CSV file into the current locked draft when receiving many rows from a
prepared manifest. File import creates draft preview rows only; it must not confirm inventory by
itself.

The standard import template uses three columns:

- `单号`: UPS, USPS, or FedEx tracking number.
- `upc`: product UPC.
- `imei`: item IMEI.

`serial` remains an optional API field for products that do not require IMEI, but it is not part of
the standard inbound CSV template.

Each imported row must follow the same UPC matching, IMEI/Serial, duplicate, and exception rules as
manual scanning. Rows that fail validation should be reported with row-level reasons while other
valid rows remain in the draft for review.
