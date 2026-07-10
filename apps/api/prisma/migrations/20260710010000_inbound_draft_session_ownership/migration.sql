ALTER TABLE "inbound_batches"
ADD COLUMN "creatorSessionId" VARCHAR(128);

CREATE INDEX "inbound_batches_operatorId_creatorSessionId_status_updatedAt_idx"
ON "inbound_batches"("operatorId", "creatorSessionId", "status", "updatedAt");
