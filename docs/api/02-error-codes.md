# Error Codes

The API exposes stable machine-readable error codes through:

```text
apps/api/src/common/errors/error-codes.ts
```

## Current Codes

| Code                      | Meaning                                       | Typical HTTP Status |
| ------------------------- | --------------------------------------------- | ------------------- |
| `AUTHENTICATION_REQUIRED` | Login or valid token is required.             | `401`               |
| `AUTHENTICATION_FAILED`   | Login credentials or token validation failed. | `401`               |
| `PERMISSION_DENIED`       | Current user lacks the required permission.   | `403`               |
| `VALIDATION_FAILED`       | DTO or query parameter validation failed.     | `400`               |
| `BUSINESS_RULE_FAILED`    | A WMS business rule blocked the operation.    | `400`, `409`, `422` |
| `RESOURCE_NOT_FOUND`      | Requested record does not exist.              | `404`               |
| `CONFLICT`                | Duplicate data or state conflict.             | `409`               |
| `INTERNAL_SERVER_ERROR`   | Unexpected server failure.                    | `500`               |

## Business Errors

Use `BusinessError` for expected business-rule failures in services:

```ts
throw new BusinessError(
  ErrorCode.BUSINESS_RULE_FAILED,
  'Customer is locked',
  { customerId },
  HttpStatus.CONFLICT,
);
```

The exception filter preserves the business code, message, optional details, and request ID.

## Validation Errors

Validation errors use:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Validation failed",
  "details": {
    "fields": ["page must not be less than 1"]
  }
}
```

Frontend code should display `message` for the high-level notification and may use `details.fields` for field-level feedback.
