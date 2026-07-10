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

## Draft Ownership And Multi-Operator Receiving

- Every new inbound draft is bound to both the authenticated account and the current login
  `sessionId`. The creating login session is the draft owner.
- All draft lookup, recovery, package review, add, import, edit, delete, clear, and confirmation
  operations are available only to the creating login session. Another account cannot operate the
  draft, and a second login session for the same account cannot take it over.
- A legacy open draft whose `creatorSessionId` is empty may be claimed only by its original creating
  account. The first valid session from that account claims it atomically; after that claim, the same
  session-only ownership rule applies.
- Different operators, or different login sessions for a shared account, may each create a separate
  draft for the same customer. Each person reviews and confirms only their own draft; confirmed
  inventory still aggregates under the common customer owner.
- Final inbound confirmation must be clicked by the draft's creating login session. A different
  session cannot perform the final confirmation on the creator's behalf.
- Add, update, delete, clear, and confirm operations lock the owning batch row with `FOR UPDATE` and
  run serially. This prevents a row from being appended or changed while the same draft is being
  confirmed and prevents a confirmed batch from retaining new `PENDING` rows.

## UPC Matching

- UPC values are normalized and validated with the shared UPC validator.
- Only active UPC mappings that point to active products can be used for normal inbound preview rows.
- Unmatched UPC values must be rejected during scan entry. Operators need to maintain the UPC in
  商品管理 first, then scan the item again. The scan page should not add an unmatched UPC row to the
  current draft.

## IMEI And Serial

- IMEI is the preferred single-item tracking ID for Apple devices.
- Products with `requiresImei = true` must provide a valid IMEI value. The validator accepts classic 15-digit numeric IMEI values and Apple tablet alphanumeric identifiers such as `SH9LRL91YFC`.
- Products with `requiresImei = false` can use Serial or IMEI in the current phase.
- A preview item cannot provide both IMEI and Serial.
- Duplicate IMEI or Serial values are blocking conditions and must not create normal inventory.
- If an IMEI or Serial already exists in the current draft, the scan page and API must reject the new
  preview row immediately instead of allowing another `PENDING` row.
- If an IMEI or Serial already exists in inventory, the scan entry is rejected before saving another
  preview row. Confirmation also rechecks existing inventory identities before writing inventory.

## Package Tracking

- UPS and FedEx tracking values are validated independently and can also be attached to each preview item.
- The current API and database field remains `upsTrackingNo` for compatibility, but the business meaning is package tracking number.
- Multiple items may share one package tracking number within the same package.
- A package tracking value already confirmed in prior inbound records is treated as a duplicate package signal and can create `UPS_DUPLICATED` exceptions.
- Package tracking validation distinguishes a supported format from an auto-accepted format. Complete
  UPS tracking numbers and FedEx tracking numbers that start with `9622` and contain 22 to 34 digits
  in total are both supported and auto-accepted. Only those complete values are eligible for automatic
  focus movement from package tracking to UPC; partial, overlong, or otherwise malformed values must
  remain in the package tracking field.
- `BB0000` package numbers are manually entered by warehouse operators when the warehouse
  compensates a customer with a replacement package. The system normalizes them to uppercase,
  stores them as package tracking numbers, accepts the exact value `BB0000` as valid, and still
  applies normal duplicate tracking checks. Because `BB0000` can also carry an alphanumeric suffix,
  neither the exact prefix nor a suffixed value may move focus on an idle-input timer. The operator
  must press Enter, or the scanner must send its completion key, before the page reviews the value and
  moves to UPC.
- USPS and non-9622 FedEx values are supported formats but are not auto-accepted for the current
  receiving workflow. They must pause the scan page and require explicit operator confirmation before
  focus moves to UPC or the item can be added to the draft.
- Explicit operator confirmation only allows supported package tracking formats such as USPS and
  non-9622 FedEx. Completely unsupported values, random text, and non-tracking numbers must still
  be rejected before a row is saved. An unsupported value must keep focus in the package tracking
  field and the page must not offer a `继续入库` action for that value.
- When a package tracking number is entered, the scan page should warn the operator if the number
  is a supported manual-review format, if it already appears in confirmed inbound records, or if it
  already appears in the current draft. Only a format-valid warning can offer the choice to modify the
  number or explicitly continue inbound. After explicit confirmation, the current scan can still be
  saved with that package tracking value.

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

- Verify that the confirming account and login session own the draft.
- Lock the draft batch row with `FOR UPDATE`, serializing confirmation against add, update, delete,
  and clear operations on the same draft.
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

The manual add action should remain available as a fallback. The page should show the current
inbound draft directly below the customer lock section and above the scan-mode/input section. This
area is the pre-confirmation review area, so operators can inspect pending rows before they continue
scanning.

Pending and exception rows in the current draft table must support basic pre-confirmation actions:
edit, save, cancel, and delete. Saving an edited row must overwrite the original preview row and
re-run the same UPC, package tracking, IMEI/Serial, duplicate, and scan-mode rules. It must not add
another preview row. Deleting a row marks it voided and refreshes the review summary. The table's
operation buttons must remain visible and usable at normal desktop widths; narrower screens may
scroll the row content, but edit/save/delete controls should not disappear off the far right.

When the inbound scan page is opened without a valid local draft lock, it should automatically load
the current login session's latest unfinished `DRAFT` inbound batch. The restored draft must restore its
customer, optional alias, warehouse, summary, pending rows, and blocking exception state. It must not
restore another account's draft, another login session's draft, or a confirmed batch. An eligible
legacy draft may be restored only after the original account's current session atomically claims it.

After a row is automatically or manually added, the scan entry form should restore keyboard focus to
the next receiving input so operators can continue with a scanner without clicking the mouse again.
Automatic focus movement and Enter-key movement must use the same package-tracking decision and API
review path. A complete UPS value or a complete 9622-prefixed FedEx value can move to UPC automatically
after review succeeds. USPS and non-9622 FedEx values stay in the package tracking field until the
operator confirms the format-valid warning. Unsupported values stay in the package tracking field and
cannot be manually continued. `BB0000` values, with or without a suffix, require Enter or the scanner's
completion key so the exact prefix cannot move focus while the operator is still typing a suffix.
If the operator changes the input while an asynchronous review is running, the response for the older
value must not move focus or replace the warning state for the newer value.
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

If the active draft contains exception rows created by supported exception workflows, the exception
summary should help the operator jump to the exception row and edit that row in place. Saving the
correction must overwrite the original preview row and re-run the same UPC, package tracking,
IMEI/Serial, duplicate, and scan-mode rules. It must not add another preview row. The original
exception row remains removable during the draft lifecycle.

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
valid rows remain in the draft for review. Unmatched UPC rows, unsupported tracking values, and
inventory-duplicate IMEI/Serial rows should fail import rather than being appended to the draft.
