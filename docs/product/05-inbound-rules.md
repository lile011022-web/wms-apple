# Inbound Rules

## Purpose

Inbound scanning receives Apple products into customer-owned warehouse inventory.

The customer must be locked before scan data becomes operational inventory. Package tracking numbers, UPC, IMEI, and Serial values captured in the draft belong to that locked customer.

## Customer Lock

- New inbound drafts require an active customer when the locked-customer setting is enabled.
- Operators may optionally select an active customer alias / sub-customer after selecting the parent
  customer. The alias records the receiving name, while the parent customer remains the inventory
  owner.
- An alias can be used only when it belongs to the selected parent customer and is active.
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
- If an IMEI or Serial already exists in the current draft, the scan page and API must reject the new
  preview row immediately instead of allowing another `PENDING` row.
- If an IMEI or Serial already exists in inventory, confirmation of the draft is rejected until
  the operator fixes or deletes the duplicate preview row.

## Package Tracking

- UPS and FedEx tracking values are validated independently and can also be attached to each preview item.
- The current API and database field remains `upsTrackingNo` for compatibility, but the business meaning is package tracking number.
- Multiple items may share one package tracking number within the same package.
- A package tracking value already confirmed in prior inbound records is treated as a duplicate package signal and can create `UPS_DUPLICATED` exceptions.
- The scan page auto-accepts UPS tracking numbers, warehouse compensation package numbers that
  start with `BB0000`, and FedEx tracking numbers that start with `9622` and contain 22 to 34 digits
  in total. These values can proceed without an extra operator warning.
- `BB0000` package numbers are manually entered by warehouse operators when the warehouse
  compensates a customer with a replacement package. The system normalizes them to uppercase,
  stores them as package tracking numbers, accepts the exact value `BB0000` as valid, and still
  applies normal duplicate tracking checks.
- USPS values, non-9622 FedEx values, and all other package tracking formats are abnormal for the
  current receiving workflow. They must pause the scan page and require explicit operator
  confirmation before the item can be added to the draft.
- When a package tracking number is entered, the scan page should warn the operator if the number
  does not match the UPS, `BB0000` warehouse compensation, or 9622 FedEx auto-accept rules, if it
  already appears in confirmed inbound records, or if it already appears in the current draft. The
  operator can either modify the number or explicitly continue inbound. After explicit confirmation,
  the current scan can still be saved with that package tracking value.

## Confirmation

Confirmation is the point where preview data becomes inventory.

Before confirmation, the inbound scan page should show an always-current review summary for the
active draft. The summary must help the operator verify the number of scanned product units, unique
UPC values, product styles, package tracking numbers, pending rows, exception rows, and the count
per UPC/product.
The page must also let operators restore an unfinished draft by its visible `INB-...` batch number,
so browser-local state does not hide an older open receiving batch after a refresh, device switch, or
accidental new draft.
The draft detail table and UPC review must follow scan-time ascending order: earlier scanned rows
stay above later rows, and the newest scan appears at the bottom of the current review sequence.
Exception rows must show the operator-facing abnormal reason, such as unmatched UPC, duplicate
IMEI/Serial, or duplicated package tracking number, rather than only showing the generic
`EXCEPTION` status.

The system must:

- Recheck duplicates inside the transaction.
- Convert database-level IMEI/Serial uniqueness conflicts into operator-readable duplicate
  messages instead of exposing a generic server error.
- Create inventory only for valid preview rows.
- Copy the draft's customer alias to confirmed inbound rows and inventory rows when one was selected.
- Mark duplicate rows as exceptions instead of creating inventory.
- Link confirmed inbound items to the created inventory items.
- Write an `INBOUND_CONFIRM` audit log.
- Allow large restored drafts enough transaction time to confirm hundreds of pending rows; if the
  database still times out, the operator must see a batch-size retry message instead of a generic
  database failure.

## Delete Policy

Inbound preview deletion is logical during the draft lifecycle. Removed rows are marked `VOIDED`.

Confirmed inbound records and inventory rows must not be physically deleted by normal inbound workflows.

If an operator confirms or leaves an inbound row with wrong scan fields, the correction must be done
from the inbound records page instead of deleting history. Operators can correct package tracking
number, UPC, and IMEI/Serial in one row-level correction panel. A corrected UPC must match an active
UPC/product mapping. If the row already has linked inventory, the system updates both the inbound
record and linked inventory item in one audited transaction. If the row belongs to an already
confirmed batch and is still `EXCEPTION` or `PENDING` without linked inventory, saving a valid
correction creates inventory and marks the row as normal `CONFIRMED` inbound. Rows that still belong
to a draft batch must be corrected from the inbound scan page, not from inbound records, so one row
cannot partially confirm an unfinished draft. Packed or outbound inventory cannot be corrected
through this flow.

The inbound records page must support all-customer, all-time lookup. When an operator is checking a
package tracking number and does not know the customer, the customer filter can stay on `全部客户`,
and the search should cover all historical inbound rows across every customer.
The same search box must also support device suffix lookup: when the operator enters the last six
characters of an IMEI or Serial, the inbound records page returns rows whose IMEI or Serial ends
with that value.

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
After the package tracking input receives a complete tracking value, focus should move to UPC
automatically even when the scanner does not send an Enter key. Abnormal package tracking values may
still require the operator to confirm continuing before the row can be saved.
In standard mode, after the package tracking number is present and the UPC input receives a complete
UPC value, focus should move to IMEI automatically even when the scanner does not send an Enter key.
The default loop starts the next row at the package tracking field. When the operator enables the
same-package continuous option, the page must first review the current package tracking number.
Duplicate tracking numbers and tracking numbers outside the UPS, `BB0000` warehouse compensation,
or 9622-prefixed FedEx auto-accept rules must be confirmed before the option becomes active. After
confirmation, the current package tracking number is retained after a successful row and focus moves
back to UPC for the next item.
While same-package continuous scanning is active, repeated use of that retained tracking number
inside the current draft is treated as already confirmed for the next item. Other abnormal tracking
signals, such as unsupported format or historical confirmed duplicates, still require explicit
operator confirmation.
Exception rows must pause this focus loop until the abnormal row is corrected or removed.
Focus restoration must run after the page has rendered the updated draft row so scanner operators do
not need to click the next input during high-volume receiving.

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
