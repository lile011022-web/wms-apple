# Dashboard and Audit Log Rules

## Dashboard Metrics

- Today inbound count uses confirmed inbound items with `scannedAt` inside the current UTC day.
- Today outbound box count uses sealed outbound boxes with `sealedAt` inside the current UTC day.
- In-stock total counts inventory items with status `IN_STOCK`.
- Pending exception count counts exception records with status `OPEN`.
- The seven-day trend includes today plus the previous six UTC calendar days.
- Inbound trend counts confirmed inbound items.
- Outbound trend counts sealed outbound boxes.
- Exception distribution groups open exceptions by exception type.
- The inbound customer breakdown lists every customer with confirmed inbound items today, sorted by count descending.
- Dashboard endpoints may be filtered by warehouse.

## Audit Logs

- Audit logs are append-only and must include stable action and resource names.
- Query responses must expose actor, action, target, before snapshot, after snapshot, request ID, and creation time.
- Recent operation logs show the latest 10 audit events.
- The paged audit-log list supports filtering by action, resource, operator, request ID, and date range.
- Users must hold `audit-logs.read` to view audit logs.
- Users must hold `dashboard.read` to view dashboard metrics.
