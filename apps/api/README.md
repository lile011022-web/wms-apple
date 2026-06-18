# apps/api

NestJS + Prisma backend for WMS Scan.

## Responsibilities

- REST API under `/api/v1`.
- Swagger documentation under `/api/docs`.
- Authentication, authorization, users, roles, permissions, and audit logs.
- Warehouse settings, customers, UPC product library, inbound, inventory, outbound, exceptions, customer changes, reports, dashboard, and system settings.
- Prisma schema, migrations, and development seed data.

## Local Commands

Run from the repository root:

```bash
pnpm --filter @wms-scan/api dev
pnpm --filter @wms-scan/api build
pnpm --filter @wms-scan/api typecheck
pnpm --filter @wms-scan/api lint
pnpm --filter @wms-scan/api test:unit
pnpm --filter @wms-scan/api test:e2e
```

Database commands:

```bash
pnpm --filter @wms-scan/api prisma:generate
pnpm --filter @wms-scan/api prisma:migrate
SEED_ADMIN_PASSWORD=<your-local-admin-password> pnpm --filter @wms-scan/api prisma:seed
pnpm --filter @wms-scan/api prisma:studio
```

## Module Map

- `src/config`: application, database, Redis, JWT, and environment schema.
- `src/common`: guards, decorators, filters, interceptors, error types, and shared DTOs.
- `src/database`: Prisma service and module boundary.
- `src/health`: health check endpoint.
- `src/jobs`: queue module boundary for future async jobs.
- `src/modules/auth`: login, refresh, logout, current user.
- `src/modules/users`, `roles`, `permissions`: access-management APIs.
- `src/modules/customers`: customer master data and batch customer change workflow.
- `src/modules/products`: UPC product library and product import.
- `src/modules/inbound`: inbound draft scanning and inbound records.
- `src/modules/inventory`: customer inventory and outbound availability.
- `src/modules/outbound`: box creation, packing, box item management, and sealing.
- `src/modules/exceptions`: exception pool and batch actions.
- `src/modules/reports`: detail-download report exports, dashboard metrics, and audit-log querying.
- `src/modules/settings`, `warehouses`: system setup APIs.
- `prisma`: schema, migrations, and seed script.

Controllers should stay HTTP-focused, services should own business rules, and repositories should own persistence.
