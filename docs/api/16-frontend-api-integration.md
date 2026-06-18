# Frontend API Integration

## Purpose

This document defines the phase-15 frontend integration baseline for `apps/web`.

The frontend now has:

- A shared Axios client in `apps/web/src/api/client.ts`.
- Local access and refresh token persistence in `apps/web/src/api/token-store.ts`.
- Auth API helpers in `apps/web/src/api/auth.ts`.
- System settings API helpers in `apps/web/src/api/settings.ts`.
- Workflow API helpers in `apps/web/src/api/workflow.ts`.
- A code-level integration order in `apps/web/src/api/integration-plan.ts`.

## Base Client Rules

All frontend API requests use:

```text
VITE_API_BASE_URL || http://localhost:3000/api/v1
```

The request interceptor reads the local access token and sends:

```text
Authorization: Bearer <accessToken>
```

The `request<T>()` helper unwraps successful API envelopes and throws `ApiClientError` for failed envelopes. This keeps React pages focused on business state instead of response-envelope plumbing.

## Integration Order

The frontend sequence is represented by `apiIntegrationSteps`:

1. `GET /health` and unified error handling.
2. Auth bootstrap: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
3. Customer options.
4. UPC lookup through `GET /products/by-upc/:upc`.
5. Customer CRUD.
6. UPC product CRUD.
7. Inbound drafts, scans, and confirmation.
8. Inbound record lookup.
9. Customer inventory lookup.
10. Outbound packing.
11. Exception pool handling.
12. Batch customer changes through `/customer-changes`.
13. Report preview and export history.
14. Dashboard and recent audit logs.
15. System settings load and save.

## System Settings Page Wiring

`apps/web/src/pages/system-settings/page.tsx` is the first real page integration in this phase.

It calls:

```text
GET /warehouses?isActive=true
GET /settings
PATCH /settings
```

Usage logic:

- Load active warehouses for the default warehouse selector.
- Load grouped settings into local form state.
- Save the full grouped settings payload through `PATCH /settings`.
- Require the signed-in user to have backend `settings.manage` permission.
- Surface load and save failures in-page without replacing backend validation rules.

## Where To Extend Later

- Add exact response types to `apps/web/src/api/workflow.ts` as each page leaves placeholder status.
- Move page-specific React Query keys next to the page or feature folder when page logic becomes more complex.
- Add login route and current-user bootstrap around `AppLayout` before exposing protected pages in production.
- Replace remaining placeholder pages one route at a time following `apiIntegrationSteps`.
