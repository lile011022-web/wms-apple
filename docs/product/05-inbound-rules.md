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
- Products with `requiresImei = true` must provide a valid IMEI value. The validator accepts classic 15-digit numeric IMEI values and Apple tablet alphanumeric identifiers such as `SH9LRL91YFC`.
- Products with `requiresImei = false` can use Serial or IMEI in the current phase.
- A preview item cannot provide both IMEI and Serial.
- Duplicate IMEI or Serial values are blocking conditions and must not create normal inventory.
- If an IMEI or Serial already exists in inventory, confirmation of the draft is rejected until
  the operator fixes or deletes the duplicate preview row.

## Package Tracking

- UPS and FedEx tracking values are validated independently and can also be attached to each preview item.
- The current API and database field remains `upsTrackingNo` for compatibility, but the business meaning is package tracking number.
- Multiple items may share one package tracking number within the same package.
- A package tracking value already confirmed in prior inbound records is treated as a duplicate package signal and can create `UPS_DUPLICATED` exceptions.
- The scan page auto-accepts only UPS tracking numbers and FedEx tracking numbers that start with
  `9622` and contain 22 to 34 digits in total. These values can proceed without an extra operator
  warning.
- USPS values, non-9622 FedEx values, and all other package tracking formats are abnormal for the
  current receiving workflow. They must pause the scan page and require explicit operator
  confirmation before the item can be added to the draft.
- When a package tracking number is entered, the scan page should warn the operator if the number
  does not match the UPS or 9622 FedEx auto-accept rules, if it already appears in confirmed inbound
  records, or if it already appears in the current draft. The operator can either modify the number
  or explicitly continue inbound. After explicit confirmation, the current scan can still be saved
  with that package tracking value.

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

## Force Inbound

Force inbound is a supervisor exception workflow for rows that were saved as `EXCEPTION` but should become inventory after manual review.

The system must:

- Allow force inbound only from the inbound records page, after the batch has already been confirmed.
- Require a matched active UPC/product before any inventory can be created.
- Reject rows that already have inventory.
- Reject duplicate IMEI or Serial values even when force inbound is used.
- Require an operator reason and keep it on the inbound item.
- Resolve the row's open exception records and write an `INBOUND_FORCE_CONFIRM` audit log.

Force inbound is not a way to bypass UPC matching or duplicate IMEI/Serial protection. If the product cannot be identified, the UPC/product data must be fixed first.

## Scan Entry Automation

The inbound scan page supports two entry modes:

- `一版模式`: package tracking number, UPC, and IMEI must all be scanned before the page
  automatically adds the row to the current draft.
- `物流+UPC 模式`: package tracking number and UPC are enough to automatically add a row to the
  current draft. UPC must still match an active product before the row can become normal inventory.

The manual add action should remain available as a fallback. The page should show the most recently
added inbound row below the scan inputs with the same package tracking number, UPC, and IMEI field
layout as the active scan entry form. Operators can click edit on this latest row and save changes in
place; saving must overwrite the original preview row and must not create another preview row.

After a row is automatically or manually added, the scan entry form should restore keyboard focus to
the next receiving input so operators can continue with a scanner without clicking the mouse again.
The default loop starts the next row at the package tracking field. When the operator enables the
same-package continuous option, the page must first review the current package tracking number.
Duplicate tracking numbers and tracking numbers outside the UPS/9622-prefixed FedEx auto-accept
rules must be confirmed before the option becomes active. After confirmation, the current package
tracking number is retained after a successful row and focus moves back to UPC for the next item.
Exception rows must pause this focus loop until the abnormal row is corrected or removed.

If the active draft contains exception rows, the exception summary should help the operator jump to
the exception row and edit that row in place. Saving the correction must overwrite the original
preview row and re-run the same UPC, package tracking, IMEI/Serial, duplicate, and scan-mode rules.
It must not add another preview row. The original exception row remains removable during the draft
lifecycle.

If the latest active preview row is an `EXCEPTION`, the inbound scan workflow must stop before any
next receiving action. Manual scanning, automatic scanning, CSV import, and final confirmation are
blocked until that latest exception row is corrected in place or removed. This keeps operators from
continuing after a bad scan and forces the abnormal data to be resolved at the source row.

The final confirmation must still require an operator click so the review summary can be checked
first.

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
