# Authentication API

## Purpose

Authentication endpoints support the frontend login state, current-user bootstrap, and auditable login/logout operations.

All paths are under:

```text
/api/v1
```

## Token Model

The API returns stateless JWTs:

- Access token: `15m`, used as `Authorization: Bearer <token>`.
- Refresh token: `7d`, sent to `POST /auth/refresh`.

Logout writes an audit log but does not revoke already issued stateless tokens. Token revocation requires a future refresh-token persistence table.

## POST /auth/login

Authenticates an active user by email and password.

Request:

```json
{
  "email": "admin@wms-scan.local",
  "password": "local-development-password"
}
```

Response `data`:

```json
{
  "user": {
    "id": "user_id",
    "email": "admin@wms-scan.local",
    "name": "Development Admin",
    "roles": ["ADMIN"],
    "permissions": ["settings.manage"],
    "status": "ACTIVE",
    "lastLoginAt": null,
    "createdAt": "2026-06-17T00:00:00.000Z",
    "updatedAt": "2026-06-17T00:00:00.000Z"
  },
  "tokens": {
    "accessToken": "jwt",
    "refreshToken": "jwt",
    "tokenType": "Bearer",
    "expiresIn": 900
  }
}
```

Business rules:

- Email lookup is case-insensitive by normalizing input to lowercase.
- Passwords are compared against `passwordHash`; plaintext passwords are never returned.
- Disabled users receive `AUTHENTICATION_FAILED`.
- Successful login updates `lastLoginAt` and writes an `AuditLog` with action `LOGIN`.

## POST /auth/refresh

Issues a new token pair from a valid refresh token.

Request:

```json
{
  "refreshToken": "jwt"
}
```

Response `data` matches the login response shape.

Business rules:

- Only tokens signed as `type: refresh` are accepted.
- Disabled or missing users cannot refresh tokens.

## POST /auth/logout

Requires Bearer access token.

Response `data`:

```json
{
  "loggedOut": true
}
```

Business rules:

- Writes an `AuditLog` with action `LOGOUT`.
- Frontend should delete local access and refresh tokens after this call.

## GET /auth/me

Requires Bearer access token.

Returns the current active user with roles and permission codes.

Frontend usage:

- Call this endpoint during app bootstrap to decide whether the user is logged in.
- Use `permissions` to show or hide protected settings actions.
