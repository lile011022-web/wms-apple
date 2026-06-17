-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "InboundBatchStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'VOIDED');

-- CreateEnum
CREATE TYPE "InboundItemStatus" AS ENUM ('PENDING', 'CONFIRMED', 'EXCEPTION', 'VOIDED');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('IN_STOCK', 'PACKED', 'OUTBOUND', 'EXCEPTION', 'VOIDED');

-- CreateEnum
CREATE TYPE "OutboundBoxStatus" AS ENUM ('OPEN', 'SEALED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('UPC_NOT_FOUND', 'IMEI_DUPLICATED', 'UPS_DUPLICATED', 'CUSTOMER_MISMATCH', 'IMEI_NOT_IN_STOCK');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED', 'INVALID');

-- CreateEnum
CREATE TYPE "ReportExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'INBOUND_CONFIRM', 'OUTBOUND_BOX_SEAL', 'EXCEPTION_HANDLE', 'CUSTOMER_BATCH_CHANGE', 'UPC_PRODUCT_CHANGE', 'CUSTOMER_CHANGE', 'USER_CHANGE', 'ROLE_CHANGE', 'PERMISSION_CHANGE', 'SYSTEM_SETTING_CHANGE', 'REPORT_EXPORT');

-- CreateEnum
CREATE TYPE "SettingValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactInfo" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT 'Apple',
    "name" TEXT NOT NULL,
    "model" TEXT,
    "category" TEXT,
    "color" TEXT,
    "capacity" TEXT,
    "requiresImei" BOOLEAN NOT NULL DEFAULT true,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_upcs" (
    "id" TEXT NOT NULL,
    "upc" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_upcs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_batches" (
    "id" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "status" "InboundBatchStatus" NOT NULL DEFAULT 'CONFIRMED',
    "confirmedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_items" (
    "id" TEXT NOT NULL,
    "inboundBatchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT,
    "inventoryItemId" TEXT,
    "upsTrackingNo" TEXT,
    "upc" TEXT NOT NULL,
    "imei" TEXT,
    "serial" TEXT,
    "status" "InboundItemStatus" NOT NULL DEFAULT 'CONFIRMED',
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "inboundBatchId" TEXT NOT NULL,
    "imei" TEXT,
    "serial" TEXT,
    "upc" TEXT NOT NULL,
    "upsTrackingNo" TEXT,
    "status" "InventoryStatus" NOT NULL DEFAULT 'IN_STOCK',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "packedAt" TIMESTAMP(3),
    "outboundAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_boxes" (
    "id" TEXT NOT NULL,
    "boxNo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "OutboundBoxStatus" NOT NULL DEFAULT 'OPEN',
    "sealedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_boxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_box_items" (
    "id" TEXT NOT NULL,
    "outboundBoxId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "packedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_box_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exception_records" (
    "id" TEXT NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "customerId" TEXT,
    "warehouseId" TEXT,
    "productId" TEXT,
    "inboundItemId" TEXT,
    "inventoryItemId" TEXT,
    "rawValue" TEXT NOT NULL,
    "upsTrackingNo" TEXT,
    "upc" TEXT,
    "imei" TEXT,
    "serial" TEXT,
    "resolutionNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exception_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_change_logs" (
    "id" TEXT NOT NULL,
    "oldCustomerId" TEXT NOT NULL,
    "newCustomerId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "affectedCount" INTEGER NOT NULL,
    "affectedItemIds" JSONB NOT NULL,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_exports" (
    "id" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "status" "ReportExportStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "fileUrl" TEXT,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "operatorId" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "valueType" "SettingValueType" NOT NULL DEFAULT 'JSON',
    "description" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_upcs_upc_key" ON "product_upcs"("upc");

-- CreateIndex
CREATE INDEX "product_upcs_productId_idx" ON "product_upcs"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_batches_batchNo_key" ON "inbound_batches"("batchNo");

-- CreateIndex
CREATE INDEX "inbound_batches_customerId_createdAt_idx" ON "inbound_batches"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "inbound_batches_warehouseId_createdAt_idx" ON "inbound_batches"("warehouseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_items_inventoryItemId_key" ON "inbound_items"("inventoryItemId");

-- CreateIndex
CREATE INDEX "inbound_items_customerId_scannedAt_idx" ON "inbound_items"("customerId", "scannedAt");

-- CreateIndex
CREATE INDEX "inbound_items_upsTrackingNo_idx" ON "inbound_items"("upsTrackingNo");

-- CreateIndex
CREATE INDEX "inbound_items_upc_idx" ON "inbound_items"("upc");

-- CreateIndex
CREATE INDEX "inbound_items_imei_idx" ON "inbound_items"("imei");

-- CreateIndex
CREATE INDEX "inbound_items_serial_idx" ON "inbound_items"("serial");

-- CreateIndex
CREATE INDEX "inventory_items_customerId_status_idx" ON "inventory_items"("customerId", "status");

-- CreateIndex
CREATE INDEX "inventory_items_warehouseId_status_idx" ON "inventory_items"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "inventory_items_productId_status_idx" ON "inventory_items"("productId", "status");

-- CreateIndex
CREATE INDEX "inventory_items_upsTrackingNo_idx" ON "inventory_items"("upsTrackingNo");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_imei_key" ON "inventory_items"("imei");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_serial_key" ON "inventory_items"("serial");

-- CreateIndex
CREATE INDEX "outbound_boxes_customerId_status_idx" ON "outbound_boxes"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_boxes_warehouseId_boxNo_key" ON "outbound_boxes"("warehouseId", "boxNo");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_box_items_inventoryItemId_key" ON "outbound_box_items"("inventoryItemId");

-- CreateIndex
CREATE INDEX "outbound_box_items_outboundBoxId_idx" ON "outbound_box_items"("outboundBoxId");

-- CreateIndex
CREATE INDEX "exception_records_status_type_idx" ON "exception_records"("status", "type");

-- CreateIndex
CREATE INDEX "exception_records_customerId_status_idx" ON "exception_records"("customerId", "status");

-- CreateIndex
CREATE INDEX "exception_records_upc_idx" ON "exception_records"("upc");

-- CreateIndex
CREATE INDEX "exception_records_imei_idx" ON "exception_records"("imei");

-- CreateIndex
CREATE INDEX "customer_change_logs_oldCustomerId_createdAt_idx" ON "customer_change_logs"("oldCustomerId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_change_logs_newCustomerId_createdAt_idx" ON "customer_change_logs"("newCustomerId", "createdAt");

-- CreateIndex
CREATE INDEX "report_exports_requestedById_createdAt_idx" ON "report_exports"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "report_exports_status_createdAt_idx" ON "report_exports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_operatorId_createdAt_idx" ON "audit_logs"("operatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_upcs" ADD CONSTRAINT "product_upcs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_batches" ADD CONSTRAINT "inbound_batches_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_batches" ADD CONSTRAINT "inbound_batches_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_batches" ADD CONSTRAINT "inbound_batches_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_items" ADD CONSTRAINT "inbound_items_inboundBatchId_fkey" FOREIGN KEY ("inboundBatchId") REFERENCES "inbound_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_items" ADD CONSTRAINT "inbound_items_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_items" ADD CONSTRAINT "inbound_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_items" ADD CONSTRAINT "inbound_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_inboundBatchId_fkey" FOREIGN KEY ("inboundBatchId") REFERENCES "inbound_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_boxes" ADD CONSTRAINT "outbound_boxes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_boxes" ADD CONSTRAINT "outbound_boxes_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_boxes" ADD CONSTRAINT "outbound_boxes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_box_items" ADD CONSTRAINT "outbound_box_items_outboundBoxId_fkey" FOREIGN KEY ("outboundBoxId") REFERENCES "outbound_boxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_box_items" ADD CONSTRAINT "outbound_box_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_records" ADD CONSTRAINT "exception_records_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_records" ADD CONSTRAINT "exception_records_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_records" ADD CONSTRAINT "exception_records_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_records" ADD CONSTRAINT "exception_records_inboundItemId_fkey" FOREIGN KEY ("inboundItemId") REFERENCES "inbound_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_records" ADD CONSTRAINT "exception_records_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_change_logs" ADD CONSTRAINT "customer_change_logs_oldCustomerId_fkey" FOREIGN KEY ("oldCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_change_logs" ADD CONSTRAINT "customer_change_logs_newCustomerId_fkey" FOREIGN KEY ("newCustomerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_change_logs" ADD CONSTRAINT "customer_change_logs_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

