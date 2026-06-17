# REST Conventions

## Base Path

All backend routes use the global prefix:

```text
/api/v1
```

Swagger is exposed at:

```text
/api/docs
```

Swagger uses the following phase-one API groups:

- `Health`
- `Auth`
- `Users`
- `Roles`
- `Permissions`
- `Warehouses`
- `Customers`
- `Products`
- `Inbound`
- `Inventory`
- `Outbound`
- `Exceptions`
- `Reports`
- `Audit Logs`
- `Settings`

JWT authentication is documented globally as `access-token` Bearer Auth. Future protected controllers should use the same Swagger security name when adding route-level auth metadata.

## Response Envelope

Successful responses are wrapped by the global request ID interceptor:

```json
{
  "success": true,
  "data": {},
  "requestId": "request-id"
}
```

Failed responses are wrapped by the global exception filter:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Validation failed",
    "details": {
      "fields": ["page must not be less than 1"]
    }
  },
  "requestId": "request-id"
}
```

`x-request-id` may be supplied by clients. If omitted, the API generates one and returns it in both the response header and body.

## List Query Defaults

List endpoints should reuse `PaginationQueryDto` from `apps/api/src/common/dto`.

Default behavior:

- `page`: `1`
- `pageSize`: `20`
- `pageSize` maximum: `100`
- `sortOrder`: `desc`
- `search`: optional string
- `sortBy`: optional string

Business modules should define explicit allowed `sortBy` fields before passing values into repositories.

## HTTP Status Usage

- `200`: successful read or update.
- `201`: successful creation.
- `400`: request parameter validation failed.
- `401`: authentication is missing or invalid.
- `403`: authenticated user lacks permission.
- `404`: resource was not found.
- `409`: duplicate resource or business conflict.
- `422`: valid request format but business rule cannot be completed.
- `500`: unexpected server failure.
