# Backend Development Rules

## Purpose

The backend must remain modular and maintainable. Future changes should happen in predictable locations without broad rewrites.

## Module Boundaries

Backend code lives only in:

```text
apps/api/
```

Each business capability must live under:

```text
apps/api/src/modules/<module-name>/
```

Shared types, enums, and validation rules must live in:

```text
packages/shared/
```

## Standard Module Shape

Each business module should follow this structure:

```text
modules/<name>/
  <name>.module.ts
  <name>.controller.ts
  <name>.service.ts
  <name>.repository.ts
  dto/
  entities/
  constants/
  tests/
```

## Responsibilities

- Controller: HTTP routing, authentication guards, permission guards, DTO binding.
- Service: business rules, transaction orchestration, domain decisions.
- Repository: database reads and writes.
- DTO: request and response shapes.
- Entities: module-owned domain shapes when needed.
- Constants: module-specific constants only.
- Tests: unit and integration tests for critical behavior.

## Hard Rules

- Controllers must not call Prisma directly.
- Controllers must not contain business rules.
- Services must not parse raw HTTP requests.
- Repositories must not decide business policy.
- Shared enums must come from `packages/shared` when used by both frontend and backend.
- Inventory state changes must run inside database transactions.
- Critical write operations must create audit logs.
- Batch operations must support preview before commit.
- Records that matter for audit should be voided or state-changed, not physically deleted.
- API errors must use consistent error codes and response shape.
- Environment variables must be validated at application startup.

## Business-Critical Areas

These areas require extra care and tests:

- Inbound confirmation
- IMEI uniqueness
- UPC product matching
- Customer lock during inbound
- Outbound customer ownership validation
- Box sealing
- Batch customer changes
- Exception handling
- Audit logging

## Change Documentation

Every code change must update:

```text
docs/changelog/YYYY-MM-DD.md
```

The changelog entry must explain where future maintainers should modify the same behavior.
