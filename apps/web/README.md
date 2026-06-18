# apps/web

React + Vite + TypeScript frontend for WMS Scan.

## Responsibilities

- Browser UI for warehouse operators and administrators.
- Local login shell and token storage.
- Dashboard, inbound scan, inbound records, customer inventory, outbound packing, exception pool, batch customer change, detail download, UPC product library, customer management, and system settings pages.
- API access through the typed facade in `src/api`.

## Local Commands

Run from the repository root:

```bash
pnpm --filter @wms-scan/web dev
pnpm --filter @wms-scan/web build
pnpm --filter @wms-scan/web typecheck
pnpm --filter @wms-scan/web lint
pnpm --filter @wms-scan/web test
```

Default local URL:

```text
http://localhost:5173
```

Set `VITE_API_BASE_URL` in `.env` when the API is not running at `http://localhost:3000/api/v1`.

## Structure

- `src/app`: router, React Query providers, and app-level setup.
- `src/api`: HTTP client, auth helpers, workflow API facades, token store, and API client tests.
- `src/layouts`: authenticated application shell and navigation.
- `src/pages`: route-level workflow pages.
- `src/components`: reusable UI components when shared components are introduced.
- `src/features`: business feature modules when route logic becomes large enough to split.
- `src/styles`: global design tokens and layout styles.

Do not put backend rules or database logic in this app. Shared validation and contracts belong in `packages/shared`; product rules belong in `docs/product`.
