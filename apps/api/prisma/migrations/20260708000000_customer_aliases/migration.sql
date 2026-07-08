-- Add customer aliases for parent-customer inventory aggregation.
CREATE TABLE "customer_aliases" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_aliases_customerId_code_key" ON "customer_aliases"("customerId", "code");
CREATE INDEX "customer_aliases_customerId_status_idx" ON "customer_aliases"("customerId", "status");
CREATE INDEX "customer_aliases_code_idx" ON "customer_aliases"("code");

ALTER TABLE "customer_aliases"
ADD CONSTRAINT "customer_aliases_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inbound_batches" ADD COLUMN "customerAliasId" TEXT;
ALTER TABLE "inbound_items" ADD COLUMN "customerAliasId" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN "customerAliasId" TEXT;

CREATE INDEX "inbound_batches_customerAliasId_createdAt_idx" ON "inbound_batches"("customerAliasId", "createdAt");
CREATE INDEX "inbound_items_customerAliasId_scannedAt_idx" ON "inbound_items"("customerAliasId", "scannedAt");
CREATE INDEX "inventory_items_customerAliasId_status_idx" ON "inventory_items"("customerAliasId", "status");

ALTER TABLE "inbound_batches"
ADD CONSTRAINT "inbound_batches_customerAliasId_fkey"
FOREIGN KEY ("customerAliasId") REFERENCES "customer_aliases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inbound_items"
ADD CONSTRAINT "inbound_items_customerAliasId_fkey"
FOREIGN KEY ("customerAliasId") REFERENCES "customer_aliases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_items"
ADD CONSTRAINT "inventory_items_customerAliasId_fkey"
FOREIGN KEY ("customerAliasId") REFERENCES "customer_aliases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
