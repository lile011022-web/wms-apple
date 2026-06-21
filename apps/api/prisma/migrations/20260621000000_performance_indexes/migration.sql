CREATE INDEX IF NOT EXISTS "inventory_items_customerId_warehouseId_status_receivedAt_idx"
  ON "inventory_items"("customerId", "warehouseId", "status", "receivedAt");

CREATE INDEX IF NOT EXISTS "inventory_items_customerId_status_receivedAt_idx"
  ON "inventory_items"("customerId", "status", "receivedAt");

CREATE INDEX IF NOT EXISTS "outbound_boxes_warehouseId_status_createdAt_idx"
  ON "outbound_boxes"("warehouseId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "outbound_boxes_customerId_warehouseId_status_createdAt_idx"
  ON "outbound_boxes"("customerId", "warehouseId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "outbound_box_items_outboundBoxId_packedAt_idx"
  ON "outbound_box_items"("outboundBoxId", "packedAt");
