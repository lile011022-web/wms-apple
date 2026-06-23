-- Add outbound box photo evidence before sealing.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OUTBOUND_BOX_PHOTO_ADD';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'OUTBOUND_BOX_PHOTO_DELETE';

CREATE TABLE "outbound_box_photos" (
  "id" TEXT NOT NULL,
  "outboundBoxId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "outbound_box_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbound_box_photos_outboundBoxId_createdAt_idx"
  ON "outbound_box_photos"("outboundBoxId", "createdAt");

ALTER TABLE "outbound_box_photos"
  ADD CONSTRAINT "outbound_box_photos_outboundBoxId_fkey"
  FOREIGN KEY ("outboundBoxId") REFERENCES "outbound_boxes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "outbound_box_photos"
  ADD CONSTRAINT "outbound_box_photos_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
