# Report Rules

Reports provide traceable downloads for operational review, customer reconciliation, and audit investigation.

## Business Rules

- Operators must select a report type before previewing or exporting.
- Every report type has a fixed field whitelist.
- Requested fields outside the whitelist must be rejected.
- Filters may include customer, warehouse, product, date range, UPC, IMEI, Serial, UPS tracking number, status, and search text when applicable.
- Preview must return estimated row count before export creation.
- Preview should include a small sample of formatted rows so operators can confirm the upcoming download content before creating the file.
- Small exports can complete synchronously.
- Large exports must be routed to a background job before production use.
- Export history is scoped to the requesting user.
- Download is allowed only for the user who created the export.
- Only completed exports can be downloaded.
- Every successful export must create a `REPORT_EXPORT` audit log.

## Supported Report Types

- `INBOUND_DETAIL`: item-level inbound rows with customer, warehouse, product, scan, and linked inventory status.
- `OUTBOUND_DETAIL`: packed item rows with box, customer, warehouse, product, and packing time.
- `INVENTORY_DETAIL`: current item inventory rows with ownership, warehouse, product, IMEI, Serial, status, and latest box.
- `EXCEPTION_DETAIL`: exception rows with type, status, raw value, ownership, product, and resolution fields.
- `CUSTOMER_CHANGE_LOG`: batch customer-change logs with old customer, new customer, operator, reason, and affected count.
- `AUDIT_LOG`: critical operation logs with action, resource, operator, request ID, and timestamp.

## Page Usage

The detail-download page should:

1. Select a report type.
2. Apply filters.
3. Select fields from the allowed field list.
4. Preview estimated row count.
5. Review a small sample table of the rows and selected columns that will be exported.
6. Create a CSV or Excel export.
7. Show export history and status.
8. Download completed exports or re-create an export from history.
