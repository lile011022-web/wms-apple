# Users, Roles, And Permissions API

## Purpose

These endpoints power the System Settings user and permission management page.

All endpoints require:

```text
Authorization: Bearer <accessToken>
```

Current phase-three controllers require `settings.manage`.

## GET /users

Lists users with pagination, search, status filtering, roles, and permission codes.

Query parameters:

- `page`: default `1`.
- `pageSize`: default `20`, max `100`.
- `search`: optional email or name search.
- `status`: optional `ACTIVE` or `DISABLED`.
- `sortBy`: one of `createdAt`, `updatedAt`, `email`, `name`, `lastLoginAt`.
- `sortOrder`: `asc` or `desc`.

Response `data`:

```json
{
  "items": [
    {
      "id": "user_id",
      "email": "operator@wms-scan.local",
      "name": "Inbound Operator",
      "status": "ACTIVE",
      "roles": [{ "id": "role_id", "code": "ADMIN", "name": "Administrator" }],
      "permissions": ["settings.manage"],
      "lastLoginAt": null,
      "createdAt": "2026-06-17T00:00:00.000Z",
      "updatedAt": "2026-06-17T00:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

Password hashes are never included.

## POST /users

Creates a user and optional role assignments.

Request:

```json
{
  "email": "operator@wms-scan.local",
  "name": "Inbound Operator",
  "password": "local-password",
  "status": "ACTIVE",
  "roleCodes": ["ADMIN"]
}
```

Business rules:

- Email must be unique.
- Password is hashed with bcrypt before storage.
- Unknown role codes return `RESOURCE_NOT_FOUND`.
- Creation writes an `AuditLog` with action `USER_CHANGE`.

## PATCH /users/:id

Updates user profile fields, password, status, and optional role assignments.

Request fields are optional:

```json
{
  "name": "Senior Inbound Operator",
  "status": "DISABLED",
  "roleCodes": ["ADMIN"]
}
```

Business rules:

- Setting `status` to `DISABLED` stops future login and refresh.
- Passing `roleCodes` replaces all existing role assignments for the user.
- Updating password rehashes it.
- Update writes an `AuditLog` with action `USER_CHANGE` and before/after snapshots that omit password data.

## GET /roles

Lists roles with assigned permissions and user counts.

Response `data`:

```json
[
  {
    "id": "role_id",
    "code": "ADMIN",
    "name": "Administrator",
    "description": "Full system access.",
    "userCount": 1,
    "permissions": [
      {
        "id": "permission_id",
        "code": "settings.manage",
        "name": "Manage system settings",
        "description": null
      }
    ],
    "createdAt": "2026-06-17T00:00:00.000Z",
    "updatedAt": "2026-06-17T00:00:00.000Z"
  }
]
```

## PATCH /roles/:id/permissions

Replaces a role's permission assignments.

Request:

```json
{
  "permissionCodes": ["dashboard.read", "settings.manage"]
}
```

Business rules:

- Unknown permission codes return `RESOURCE_NOT_FOUND`.
- Update writes an `AuditLog` with action `ROLE_CHANGE`.

## GET /permissions

Lists all permission points for the role authorization UI.

Response `data`:

```json
[
  {
    "id": "permission_id",
    "code": "settings.manage",
    "name": "Manage system settings",
    "description": null,
    "createdAt": "2026-06-17T00:00:00.000Z",
    "updatedAt": "2026-06-17T00:00:00.000Z"
  }
]
```

## Seeded Permission Codes

The development seed currently creates:

- `dashboard.read`
- `customers.manage`
- `products.manage`
- `inbound.manage`
- `inventory.read`
- `outbound.manage`
- `exceptions.manage`
- `reports.export`
- `settings.manage`
- `users.manage`
- `roles.manage`
