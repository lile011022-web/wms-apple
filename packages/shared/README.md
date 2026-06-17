# packages/shared

Shared TypeScript package for frontend and backend.

Planned contents:

- Business enums
- Shared DTO types
- Scan validation rules
- UPC, IMEI, Serial, and UPS helpers
- Common API response types

Keep reusable business contracts here so `apps/web` and `apps/api` stay consistent.

## Maintenance Map

- `src/enums`: shared business enums.
- `src/types`: shared API and domain types.
- `src/validators`: shared scan validation helpers.
- `src/constants`: stable business constants.
- `src/index.ts`: public exports for frontend and backend imports.

Do not add React, NestJS, database, or browser-specific code here.
