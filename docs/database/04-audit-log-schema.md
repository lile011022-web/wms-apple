# Audit Log Schema

## Purpose

`AuditLog` is the append-only record of critical WMS operations. It is not a replacement for business tables such as `InboundBatch`, `OutboundBox`, or `CustomerChangeLog`; it is the cross-module trail used for review, investigation, and reporting.

## Prisma Model

The schema is maintained in:

```text
apps/api/prisma/schema.prisma
```

Core fields:

- `action`: stable enum action such as `LOGIN`, `INBOUND_CONFIRM`, or `REPORT_EXPORT`.
- `resourceType`: business resource name, for example `inbound_batch`, `outbound_box`, or `customer`.
- `resourceId`: optional resource ID.
- `operatorId`: optional user ID when an operator is known.
- `requestId`: request ID from the HTTP layer.
- `ipAddress`: request IP address when available.
- `userAgent`: request user agent when available.
- `beforeSnapshot`: JSON snapshot before the operation.
- `afterSnapshot`: JSON snapshot after the operation.
- `metadata`: extra structured context.
- `createdAt`: audit event timestamp.

## Audited Operations

The product brief requires audit coverage for:

- Login and logout.
- Inbound confirmation.
- Outbound box sealing.
- Exception handling.
- Batch customer changes.
- UPC product changes.
- Customer changes.
- User, role, and permission changes.
- System setting changes.
- Report exports.

These are represented by the `AuditAction` enum in the Prisma schema.

## Writing Rules

- Write audit logs from services, not controllers.
- Write the audit log in the same transaction as the critical business change whenever possible.
- Use `beforeSnapshot` and `afterSnapshot` for changes that alter customer ownership, UPC mappings, permissions, system settings, or inventory state.
- Do not store secrets, passwords, access tokens, refresh tokens, or full authorization headers in audit snapshots or metadata.
- Prefer stable resource names in `resourceType` so later report filters are easy to build.
