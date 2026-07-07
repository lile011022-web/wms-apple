-- Store optional selected fields imported for the Google Sheets prealert handoff.
ALTER TABLE "package_prealert_items" ADD COLUMN "productModel" TEXT;
ALTER TABLE "package_prealert_items" ADD COLUMN "recipientName" TEXT;
