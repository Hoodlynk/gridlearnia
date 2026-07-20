-- CreateEnum
CREATE TYPE "CampusStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable: organization localization defaults (backfill via column defaults)
ALTER TABLE "tenants"
  ADD COLUMN "country" VARCHAR(2) NOT NULL DEFAULT 'KE',
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'KES',
  ADD COLUMN "timezone" VARCHAR(60) NOT NULL DEFAULT 'Africa/Nairobi',
  ADD COLUMN "locale" VARCHAR(10) NOT NULL DEFAULT 'en',
  ADD COLUMN "dateFormat" VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY';

-- CreateTable
CREATE TABLE "campuses" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "status" "CampusStatus" NOT NULL DEFAULT 'ACTIVE',
    "address" TEXT,
    "phone" VARCHAR(30),
    "timezone" VARCHAR(60),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "campuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campuses_tenantId_idx" ON "campuses"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "campuses_tenantId_code_key" ON "campuses"("tenantId", "code");

-- CreateTable
CREATE TABLE "tenant_modules" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "moduleKey" VARCHAR(50) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "limits" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_modules_tenantId_idx" ON "tenant_modules"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_modules_tenantId_moduleKey_key" ON "tenant_modules"("tenantId", "moduleKey");

-- AddForeignKey
ALTER TABLE "campuses" ADD CONSTRAINT "campuses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: give every existing tenant a Main Campus.
INSERT INTO "campuses" ("id", "tenantId", "name", "code", "isMain", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), t."id", 'Main Campus', 'MAIN', true, 'ACTIVE', now(), now()
FROM "tenants" t;

-- Backfill: seed the module catalogue (with default on/off state) for every
-- existing tenant. Keep this list in sync with tenant-modules.constants.ts.
INSERT INTO "tenant_modules" ("id", "tenantId", "moduleKey", "enabled", "limits", "createdAt", "updatedAt")
SELECT gen_random_uuid(), t."id", m."key", m."enabled", '{}', now(), now()
FROM "tenants" t
CROSS JOIN (VALUES
  ('school-settings', true),
  ('user-management', true),
  ('admissions', true),
  ('student-records', true),
  ('staff-management', true),
  ('attendance', true),
  ('timetable', true),
  ('exams', true),
  ('report-cards', true),
  ('homework', false),
  ('finance', true),
  ('library', false),
  ('inventory', false),
  ('procurement', false),
  ('hostel', false),
  ('transport', false),
  ('medical', false),
  ('communication', true),
  ('reports-analytics', true)
) AS m("key", "enabled");
