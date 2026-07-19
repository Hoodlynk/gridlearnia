-- Normalized school-name key: lowercase, all non-alphanumerics stripped.
-- Backfill existing rows before tightening to NOT NULL + unique.

-- Tenants
ALTER TABLE "tenants" ADD COLUMN "nameKey" VARCHAR(255);
UPDATE "tenants" SET "nameKey" = lower(regexp_replace("name", '[^a-zA-Z0-9]', '', 'g'));
ALTER TABLE "tenants" ALTER COLUMN "nameKey" SET NOT NULL;
CREATE UNIQUE INDEX "tenants_nameKey_key" ON "tenants"("nameKey");

-- School requests (not unique — only PENDING requests reserve a name)
ALTER TABLE "school_requests" ADD COLUMN "nameKey" VARCHAR(255);
UPDATE "school_requests" SET "nameKey" = lower(regexp_replace("name", '[^a-zA-Z0-9]', '', 'g'));
ALTER TABLE "school_requests" ALTER COLUMN "nameKey" SET NOT NULL;
CREATE INDEX "school_requests_nameKey_status_idx" ON "school_requests"("nameKey", "status");
