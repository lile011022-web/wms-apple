-- Store outbound shipping/tracking number on each box.
ALTER TABLE "outbound_boxes"
  ADD COLUMN "shippingTrackingNo" TEXT;
