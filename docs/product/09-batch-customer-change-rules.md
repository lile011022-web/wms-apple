# Batch Customer Change Rules

Batch customer change corrects inbound ownership mistakes after receiving.

## Business Rules

- Operators must preview selected records before commit.
- Commit must provide the `previewToken` returned by preview.
- The reason is required and is stored with the change log.
- The new customer must be active and different from the current customer.
- All selected records must still belong to the declared current customer.
- Only confirmed inbound records with linked inventory can be changed.
- Inventory in `PACKED` or `OUTBOUND` status cannot change customer.
- Commit updates inbound rows, linked inventory rows, and linked exception rows in one transaction.
- Every successful commit creates a `CustomerChangeLog`.
- Every successful commit creates a `CUSTOMER_BATCH_CHANGE` audit log.

## Preview Consistency

Preview tokens include selected inbound item IDs, current customer, target customer, linked inventory IDs, inventory status, and update timestamps. If any selected record changes after preview, commit must be rejected and the operator must preview again.

## Page Usage

The batch customer-change page should:

1. Filter candidates by customer, warehouse, time range, UPS, UPC, IMEI, product name, or search text.
2. Select records.
3. Call preview and show impact and blocked records.
4. Require a reason.
5. Submit commit with the preview token.
6. Show customer-change logs for audit review.
