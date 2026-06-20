import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { allSettingDefinitions, settingDefinitions } from '../src/modules/settings/settings.keys';

const prisma = new PrismaClient();

const permissions = [
  ['dashboard.read', 'View dashboard'],
  ['audit-logs.read', 'View audit logs'],
  ['customers.manage', 'Manage customers'],
  ['products.manage', 'Manage UPC product library'],
  ['inbound.manage', 'Manage inbound scanning'],
  ['inventory.read', 'View customer inventory'],
  ['outbound.manage', 'Manage outbound packing'],
  ['exceptions.manage', 'Handle exception pool'],
  ['reports.export', 'Export reports'],
  ['settings.manage', 'Manage system settings'],
  ['users.manage', 'Manage users'],
  ['roles.manage', 'Manage roles and role permissions'],
] as const;

const operatorPermissionCodes = [
  'dashboard.read',
  'audit-logs.read',
  'customers.manage',
  'products.manage',
  'inbound.manage',
  'inventory.read',
  'outbound.manage',
  'exceptions.manage',
  'reports.export',
] as const;

async function main() {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!seedPassword) {
    throw new Error('SEED_ADMIN_PASSWORD is required to seed the development admin user.');
  }

  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'US-LAX-01' },
    update: {},
    create: {
      code: 'US-LAX-01',
      name: 'US Los Angeles Warehouse',
      timezone: 'America/Los_Angeles',
    },
  });

  const adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: { name: 'Administrator' },
    create: {
      code: 'ADMIN',
      name: 'Administrator',
      description: 'Full system access for development and operations setup.',
    },
  });

  const operatorRole = await prisma.role.upsert({
    where: { code: 'OPERATOR' },
    update: { name: 'Warehouse Operator' },
    create: {
      code: 'OPERATOR',
      name: 'Warehouse Operator',
      description: 'Operational staff access without user, role, or system-setting administration.',
    },
  });

  for (const [code, name] of permissions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: permission.id,
      },
    });

    if (operatorPermissionCodes.includes(code)) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: operatorRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: operatorRole.id,
          permissionId: permission.id,
        },
      });
    }
  }

  const passwordHash = await bcrypt.hash(seedPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@wms-scan.local' },
    update: {
      name: 'Development Admin',
      passwordHash,
      status: 'ACTIVE',
    },
    create: {
      email: 'admin@wms-scan.local',
      name: 'Development Admin',
      passwordHash,
      status: 'ACTIVE',
    },
  });

  await prisma.userRoleAssignment.upsert({
    where: {
      userId_roleId: {
        userId: admin.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      roleId: adminRole.id,
    },
  });

  const customer = await prisma.customer.upsert({
    where: { code: 'CUST-APPLE-DEMO' },
    update: { name: 'Apple Demo Customer' },
    create: {
      code: 'CUST-APPLE-DEMO',
      name: 'Apple Demo Customer',
      contactName: 'Warehouse Ops',
      notes: 'Development-only sample customer for local workflows.',
    },
  });

  const product = await prisma.product.upsert({
    where: { sku: 'IPHONE-15-PRO-128-BLK' },
    update: {},
    create: {
      sku: 'IPHONE-15-PRO-128-BLK',
      name: 'iPhone 15 Pro 128GB Black Titanium',
      model: 'iPhone 15 Pro',
      category: 'iPhone',
      color: 'Black Titanium',
      capacity: '128GB',
      requiresImei: true,
    },
  });

  await prisma.productUpc.upsert({
    where: { upc: '194253149189' },
    update: { productId: product.id },
    create: {
      upc: '194253149189',
      productId: product.id,
    },
  });

  for (const definition of allSettingDefinitions) {
    await prisma.systemSetting.upsert({
      where: { key: definition.key },
      update: {
        value:
          definition.key === settingDefinitions.warehouseDefaultId.key
            ? warehouse.id
            : definition.defaultValue,
        valueType: definition.valueType,
        description: definition.description,
      },
      create: {
        key: definition.key,
        value:
          definition.key === settingDefinitions.warehouseDefaultId.key
            ? warehouse.id
            : definition.defaultValue,
        valueType: definition.valueType,
        description: definition.description,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      action: 'SYSTEM_SETTING_CHANGE',
      resourceType: 'seed',
      resourceId: 'development-baseline',
      afterSnapshot: {
        warehouseCode: warehouse.code,
        customerCode: customer.code,
        productSku: product.sku,
        adminEmail: admin.email,
      },
      metadata: {
        source: 'apps/api/prisma/seed.ts',
      },
    },
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});
