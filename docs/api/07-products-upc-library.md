# Products UPC Library API

## Purpose

These endpoints power the UPC product library page and provide UPC lookup for inbound scanning, inventory, outbound packing, and report displays.

All endpoints require:

```text
Authorization: Bearer <accessToken>
```

Current phase-six controllers require `products.manage`.

## GET /products

Lists products with pagination, search, status filtering, category filtering, and UPC mappings.

Query parameters:

- `page`: page number, defaults to `1`.
- `pageSize`: page size, defaults to `20`, maximum `100`.
- `search`: optional SKU, UPC, brand, product name, model, category, color, or capacity search.
- `status`: optional `ACTIVE` or `INACTIVE`.
- `category`: optional exact category filter, case-insensitive.
- `sortBy`: optional `createdAt`, `updatedAt`, `sku`, `name`, `category`, or `status`.
- `sortOrder`: optional `asc` or `desc`, defaults to `desc`.

Response `data`:

```json
{
  "items": [
    {
      "id": "product_id",
      "sku": "IPHONE-16-PRO-256-NAT",
      "brand": "Apple",
      "name": "iPhone 16 Pro 256GB Natural Titanium",
      "model": "iPhone 16 Pro",
      "category": "iPhone",
      "color": "Natural Titanium",
      "capacity": "256GB",
      "requiresImei": true,
      "status": "ACTIVE",
      "upcs": [
        {
          "id": "upc_id",
          "upc": "194253149189",
          "status": "ACTIVE"
        }
      ],
      "createdAt": "2026-06-17T00:00:00.000Z",
      "updatedAt": "2026-06-17T00:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 186
}
```

## GET /products/by-upc/:upc

Resolves one active UPC mapping to an active product for inbound scan recognition.

Business rules:

- UPC must pass the shared UPC format validator.
- Inactive UPC mappings are not returned for new inbound scans.
- Inactive products are not returned for new inbound scans.
- Unknown, inactive, or disabled UPC records return `RESOURCE_NOT_FOUND`.

Response `data` includes the product shape from `GET /products` plus `matchedUpc`.

## GET /products/:id

Returns one product profile with all UPC mappings.

Unknown product IDs return `RESOURCE_NOT_FOUND`.

## POST /products

Creates a product and at least one UPC mapping.

Request:

```json
{
  "sku": "IPHONE-16-PRO-256-NAT",
  "brand": "Apple",
  "name": "iPhone 16 Pro 256GB Natural Titanium",
  "model": "iPhone 16 Pro",
  "category": "iPhone",
  "color": "Natural Titanium",
  "capacity": "256GB",
  "requiresImei": true,
  "status": "ACTIVE",
  "upcs": ["194253149189"]
}
```

Business rules:

- `sku` is normalized to uppercase and must be unique.
- UPC values must be unique globally.
- UPC values must be valid numeric UPC values according to shared scan validation.
- `brand` defaults to `Apple`.
- `requiresImei` defaults to `true`.
- Creation writes an `AuditLog` with action `UPC_PRODUCT_CHANGE`.

## PATCH /products/:id

Updates product profile fields and, when `upcs` is supplied, replaces the product UPC mapping list.

Business rules:

- Unknown product IDs return `RESOURCE_NOT_FOUND`.
- Changing `sku` is allowed only when the new normalized SKU is unique.
- Replacement UPC values must not belong to another product.
- Update writes an `AuditLog` with action `UPC_PRODUCT_CHANGE`.

## PATCH /products/:id/status

Activates or deactivates a product.

Request:

```json
{
  "status": "INACTIVE"
}
```

Business rules:

- Status changes cascade to UPC mappings for the product.
- Inactive products and UPC mappings remain available for historical records.
- Inactive products must not resolve from `GET /products/by-upc/:upc` for new inbound scans.
- Status changes write an `AuditLog` with action `UPC_PRODUCT_CHANGE`.

## POST /products/import

Bulk imports product rows.

The UPC product library page downloads a CSV template for operators, parses it in the browser, and submits the parsed rows to this JSON endpoint. Template columns are `sku`, `name`, `brand`, `model`, `category`, `color`, `capacity`, `requiresImei`, and `upcs`. Multiple UPC values in the `upcs` column are separated with semicolons.

Request:

```json
{
  "products": [
    {
      "sku": "IPHONE-16-PRO-256-NAT",
      "name": "iPhone 16 Pro 256GB Natural Titanium",
      "category": "iPhone",
      "requiresImei": true,
      "upcs": ["194253149189"]
    }
  ]
}
```

Business rules:

- Up to 500 product rows can be submitted in one request.
- Duplicate SKU values inside the request are rejected.
- Duplicate UPC values inside the request are rejected.
- Existing SKU and UPC conflicts are rejected before import.
- Import writes one audit log with action `UPC_PRODUCT_CHANGE`, resource type `product-import`, and imported product IDs in metadata.

Response `data`:

```json
{
  "importedCount": 1,
  "items": [
    {
      "id": "product_id",
      "sku": "IPHONE-16-PRO-256-NAT",
      "upcs": [{ "id": "upc_id", "upc": "194253149189", "status": "ACTIVE" }]
    }
  ]
}
```

## DELETE /products/:id

Deletes one unused product and its UPC mappings.

Rules:

- The product must exist.
- Products referenced by inbound items, inventory items, or exception records cannot be deleted.
- A blocked deletion returns `409 Conflict` with the SKU and reference counts.
- Successful deletion writes `UPC_PRODUCT_CHANGE` with the deleted snapshot and
  `metadata.changeType = DELETE`.

## POST /products/bulk-delete

Deletes up to 100 selected unused products.

Request:

```json
{
  "ids": ["product-1", "product-2"]
}
```

The operation is all-or-nothing. Missing IDs or any selected product with inbound, inventory, or
exception references reject the complete request before deletion.

Response `data`:

```json
{
  "deletedCount": 2,
  "deletedIds": ["product-1", "product-2"]
}
```

Products with business history remain historical references and must be deactivated through
`PATCH /products/:id/status` instead of deleted.
