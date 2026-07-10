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
- Every successful login or registration creates a new UUID `sessionId`. The access token and refresh
  token issued in that response carry the same `sessionId`.
- Refreshing a token pair preserves the `sessionId` from the accepted refresh token. Refresh does not
  start a second login session.
- Access and refresh tokens without a non-empty `sessionId` are legacy tokens and are rejected. After
  this rule is deployed, users holding an older token must sign in again.

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
- Every successful call creates a new login session, even when the same account is already signed in
  on another browser or device. Concurrent logins therefore receive different `sessionId` values and
  different JWTs.
- Successful login updates `lastLoginAt` and writes an `AuditLog` with action `LOGIN`.

## POST /auth/register

Creates a new active employee account from the login page and immediately returns a login session.

Request:

```json
{
  "email": "operator@wms-scan.local",
  "name": "Inbound Operator",
  "password": "local-development-password"
}
```

Response `data` matches the login response shape.

Business rules:

- Email lookup is case-insensitive by normalizing input to lowercase.
- Passwords are hashed with bcrypt before storage.
- Duplicate emails return `CONFLICT`.
- Public registration assigns the `OPERATOR` role only.
- `OPERATOR` receives operational permissions for dashboard, audit-log lookup, customers, UPC products, inbound, inventory, outbound, exceptions, and reports.
- `OPERATOR` does not receive `settings.manage`, `users.manage`, or `roles.manage`.
- Registration writes an `AuditLog` with action `USER_CHANGE` and metadata source `public-registration`.
- Successful registration starts a new UUID-backed login session. Both returned JWTs carry that
  session's `sessionId`.

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
- The refresh token must contain a non-empty `sessionId`, and both replacement tokens keep exactly
  that value.
- Disabled or missing users cannot refresh tokens.
- A legacy refresh token without `sessionId` is rejected; the user must sign in again.

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

The authenticated request context also carries the `sessionId` recovered from the access token.
Business modules use this server-side value for login-session ownership checks; it is not added to
the public user object returned by this endpoint.

Frontend usage:

- Call this endpoint during app bootstrap to decide whether the user is logged in.
- Use `permissions` to show or hide protected settings actions.

## PATCH /auth/me/password

Requires Bearer access token.

Changes the password for the current signed-in user.

Request:

```json
{
  "currentPassword": "old-local-password",
  "newPassword": "new-local-password",
  "confirmPassword": "new-local-password"
}
```

Response `data`:

```json
{
  "passwordChanged": true
}
```

Business rules:

- `currentPassword`, `newPassword`, and `confirmPassword` must each be at least 8 characters.
- `newPassword` must match `confirmPassword`.
- The current password is verified against the stored bcrypt hash before any update.
- Wrong current password returns `AUTHENTICATION_FAILED`.
- Password hashes are never returned or written into audit snapshots.
- Successful password change writes an `AuditLog` with action `USER_CHANGE`.
