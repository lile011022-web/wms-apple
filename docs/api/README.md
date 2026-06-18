# API

API contracts and examples will live here.

Planned topics:

- REST conventions
- Error codes
- Authentication
- Users, roles, and permissions
- Warehouses and system settings
- Customers
- UPC product library
- Inbound scanning APIs
- Inventory APIs
- Outbound packing APIs
- Exception APIs
- Export APIs

Current documents:

- `01-rest-conventions.md`: base path, response envelope, request ID behavior, pagination defaults, and HTTP status usage.
- `02-error-codes.md`: stable API error codes and business/validation error response rules.
- `03-auth.md`: login, refresh, logout, current user, token behavior, and audit rules.
- `04-users-roles-permissions.md`: user management, role authorization, permission list, and audit rules.
- `05-warehouses-settings.md`: warehouse profile APIs, grouped system settings, stable setting keys, and audit rules.
- `06-customers.md`: customer CRUD, customer options, status changes, summary counts, and audit rules.
- `07-products-upc-library.md`: UPC product catalog CRUD, UPC lookup, import behavior, and audit rules.
- `08-inbound-scan.md`: inbound draft creation, scan preview, exception behavior, confirmation, and record lookup.
- `09-inbound-records.md`: inbound record filtering, detail lookup, batch item lookup, batch customer-change selection, and export-preview filter reuse.
- `10-inventory.md`: customer inventory summary, SKU summary, item details, outbound availability, and export-preview filter reuse.
- `11-outbound-packing.md`: outbound box creation, available inventory lookup, item packing/removal, box clearing, sealing, and audit behavior.
- `12-exceptions.md`: exception list, summary, detail, resolve, ignore, invalidate, and batch handling behavior.
- `13-batch-customer-change.md`: candidate lookup, preview token, commit transaction, and customer-change log behavior.
- `14-reports.md`: report preview, CSV/Excel export creation, export history, re-download, and download behavior.
- `15-dashboard-audit-logs.md`: dashboard summary, trends, exception distribution, top inbound customers, and audit-log query APIs.
- `16-frontend-api-integration.md`: frontend API client behavior, integration order, token handling, and system settings page wiring.

Testing commands:

- API unit tests: `pnpm --filter @wms-scan/api test:unit`
- API core workflow e2e tests: `pnpm --filter @wms-scan/api test:e2e`
- Web API client tests: `pnpm --filter @wms-scan/web test`
- Shared validator tests: `pnpm --filter @wms-scan/shared test`
