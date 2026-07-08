INSERT INTO "permissions" ("id", "code", "name", "description", "createdAt", "updatedAt")
VALUES
  (
    'perm_package_prealerts_read',
    'package-prealerts.read',
    'View package prealerts and package alerts',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'perm_package_prealerts_manage',
    'package-prealerts.manage',
    'Manage package prealerts and package status updates',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT roles."id", permissions."id", CURRENT_TIMESTAMP
FROM "roles"
JOIN "permissions"
  ON permissions."code" IN ('package-prealerts.read', 'package-prealerts.manage')
WHERE roles."code" IN ('ADMIN', 'OPERATOR')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
