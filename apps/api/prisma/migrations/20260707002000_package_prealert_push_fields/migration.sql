-- Add package prealert, tracking, alert, and exchange sync storage.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PACKAGE_PREALERT_CHANGE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PACKAGE_PREALERT_STATUS_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PACKAGE_ALERT_HANDLE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PACKAGE_PREALERT_INBOUND_LINK';

CREATE TYPE "PackagePrealertBatchStatus" AS ENUM ('OPEN', 'COMPLETED', 'VOIDED');

CREATE TYPE "PackageCarrier" AS ENUM ('UPS', 'USPS', 'FEDEX', 'OTHER', 'UNKNOWN');

CREATE TYPE "PackageLogisticsStatus" AS ENUM (
  'UNKNOWN',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION'
);

CREATE TYPE "PackageReceivingStatus" AS ENUM (
  'NOT_RECEIVED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'VOIDED'
);

CREATE TYPE "PackageExchangePushStatus" AS ENUM ('PENDING', 'PUSHED', 'FAILED', 'SKIPPED');

CREATE TYPE "PackageAlertType" AS ENUM (
  'DELIVERED_NOT_RECEIVED',
  'ETA_OVERDUE',
  'STALE_TRACKING',
  'DUPLICATE_PREALERT',
  'CUSTOMER_CONFLICT',
  'SYNC_FAILED',
  'UNPREALERTED_INBOUND'
);

CREATE TYPE "PackageAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

CREATE TYPE "PackageAlertStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'IGNORED');

CREATE TABLE "package_prealert_batches" (
  "id" TEXT NOT NULL,
  "batchNo" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "status" "PackagePrealertBatchStatus" NOT NULL DEFAULT 'OPEN',
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "package_prealert_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "package_prealert_items" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "carrier" "PackageCarrier" NOT NULL DEFAULT 'UNKNOWN',
  "trackingNo" TEXT NOT NULL,
  "originalTrackingLink" TEXT,
  "logisticsStatus" "PackageLogisticsStatus" NOT NULL DEFAULT 'UNKNOWN',
  "rawLogisticsStatus" TEXT,
  "logisticsUpdatedAt" TIMESTAMP(3),
  "estimatedArrivalAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "receivingStatus" "PackageReceivingStatus" NOT NULL DEFAULT 'NOT_RECEIVED',
  "exchangePushStatus" "PackageExchangePushStatus" NOT NULL DEFAULT 'PENDING',
  "exchangeRecordId" TEXT,
  "exchangePushedAt" TIMESTAMP(3),
  "exchangePulledAt" TIMESTAMP(3),
  "exchangeSyncError" TEXT,
  "inboundBatchId" TEXT,
  "inboundItemId" TEXT,
  "productModel" TEXT,
  "recipientName" TEXT,
  "notes" TEXT,
  "voidReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "package_prealert_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "package_tracking_events" (
  "id" TEXT NOT NULL,
  "prealertItemId" TEXT NOT NULL,
  "status" "PackageLogisticsStatus" NOT NULL,
  "rawStatus" TEXT,
  "eventTime" TIMESTAMP(3),
  "estimatedArrivalAt" TIMESTAMP(3),
  "location" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "package_tracking_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "package_alerts" (
  "id" TEXT NOT NULL,
  "prealertItemId" TEXT NOT NULL,
  "alertType" "PackageAlertType" NOT NULL,
  "severity" "PackageAlertSeverity" NOT NULL DEFAULT 'WARNING',
  "status" "PackageAlertStatus" NOT NULL DEFAULT 'OPEN',
  "assignedTo" TEXT,
  "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "package_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "package_prealert_batches_batchNo_key"
  ON "package_prealert_batches"("batchNo");

CREATE UNIQUE INDEX "package_prealert_items_inboundItemId_key"
  ON "package_prealert_items"("inboundItemId");

CREATE INDEX "package_prealert_batches_customerId_createdAt_idx"
  ON "package_prealert_batches"("customerId", "createdAt");

CREATE INDEX "package_prealert_batches_status_createdAt_idx"
  ON "package_prealert_batches"("status", "createdAt");

CREATE INDEX "package_prealert_items_customerId_createdAt_idx"
  ON "package_prealert_items"("customerId", "createdAt");

CREATE INDEX "package_prealert_items_trackingNo_idx"
  ON "package_prealert_items"("trackingNo");

CREATE INDEX "package_prealert_items_logisticsStatus_receivingStatus_idx"
  ON "package_prealert_items"("logisticsStatus", "receivingStatus");

CREATE INDEX "package_prealert_items_exchangePushStatus_createdAt_idx"
  ON "package_prealert_items"("exchangePushStatus", "createdAt");

CREATE INDEX "package_prealert_items_exchangeRecordId_idx"
  ON "package_prealert_items"("exchangeRecordId");

CREATE INDEX "package_prealert_items_estimatedArrivalAt_idx"
  ON "package_prealert_items"("estimatedArrivalAt");

CREATE INDEX "package_prealert_items_deliveredAt_idx"
  ON "package_prealert_items"("deliveredAt");

CREATE INDEX "package_tracking_events_prealertItemId_createdAt_idx"
  ON "package_tracking_events"("prealertItemId", "createdAt");

CREATE INDEX "package_alerts_status_alertType_idx"
  ON "package_alerts"("status", "alertType");

CREATE INDEX "package_alerts_prealertItemId_status_idx"
  ON "package_alerts"("prealertItemId", "status");

ALTER TABLE "package_prealert_batches"
  ADD CONSTRAINT "package_prealert_batches_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "package_prealert_batches"
  ADD CONSTRAINT "package_prealert_batches_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "package_prealert_items"
  ADD CONSTRAINT "package_prealert_items_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "package_prealert_batches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "package_prealert_items"
  ADD CONSTRAINT "package_prealert_items_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "package_prealert_items"
  ADD CONSTRAINT "package_prealert_items_inboundBatchId_fkey"
  FOREIGN KEY ("inboundBatchId") REFERENCES "inbound_batches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "package_prealert_items"
  ADD CONSTRAINT "package_prealert_items_inboundItemId_fkey"
  FOREIGN KEY ("inboundItemId") REFERENCES "inbound_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "package_tracking_events"
  ADD CONSTRAINT "package_tracking_events_prealertItemId_fkey"
  FOREIGN KEY ("prealertItemId") REFERENCES "package_prealert_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "package_alerts"
  ADD CONSTRAINT "package_alerts_prealertItemId_fkey"
  FOREIGN KEY ("prealertItemId") REFERENCES "package_prealert_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
