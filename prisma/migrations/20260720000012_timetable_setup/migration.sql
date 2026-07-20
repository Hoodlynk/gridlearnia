-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('CLASSROOM', 'LAB', 'HALL', 'LIBRARY', 'SPORTS', 'OTHER');

-- CreateEnum
CREATE TYPE "TimetableStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable: timetable demand lives on the teaching assignment
ALTER TABLE "teaching_assignments"
  ADD COLUMN "periodsPerWeek" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "doublePeriods" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "requiredRoomType" "RoomType",
  ADD COLUMN "preferMorning" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: per-teacher daily load ceiling
ALTER TABLE "staff" ADD COLUMN "maxPeriodsPerDay" SMALLINT;

-- CreateTable
CREATE TABLE "timetable_settings" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "teachingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "dayStartTime" VARCHAR(5),
    "lessonDurationMinutes" SMALLINT,
    "lessonsPerDay" SMALLINT,
    "maxPeriodsPerTeacherPerDay" SMALLINT,
    "maxLessonsPerClassPerDay" SMALLINT,
    "morningEndsAfterPeriod" SMALLINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periods" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "order" INTEGER NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "campusId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "type" "RoomType" NOT NULL DEFAULT 'CLASSROOM',
    "capacity" SMALLINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_unavailability" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "day" SMALLINT NOT NULL,
    "reason" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_unavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetables" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "termId" UUID,
    "name" VARCHAR(100) NOT NULL,
    "status" "TimetableStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" UUID,
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "timetables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetables_tenantId_idx" ON "timetables"("tenantId");

-- CreateIndex
CREATE INDEX "timetables_tenantId_status_idx" ON "timetables"("tenantId", "status");

-- CreateIndex
CREATE INDEX "timetables_tenantId_effectiveFrom_idx" ON "timetables"("tenantId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_termId_fkey" FOREIGN KEY ("termId") REFERENCES "academic_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "timetable_settings_tenantId_key" ON "timetable_settings"("tenantId");

-- CreateIndex
CREATE INDEX "periods_tenantId_idx" ON "periods"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "periods_tenantId_order_key" ON "periods"("tenantId", "order");

-- CreateIndex
CREATE INDEX "rooms_tenantId_idx" ON "rooms"("tenantId");

-- CreateIndex
CREATE INDEX "rooms_campusId_idx" ON "rooms"("campusId");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_tenantId_code_key" ON "rooms"("tenantId", "code");

-- CreateIndex
CREATE INDEX "staff_unavailability_tenantId_idx" ON "staff_unavailability"("tenantId");

-- CreateIndex
CREATE INDEX "staff_unavailability_staffId_idx" ON "staff_unavailability"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_unavailability_staffId_day_periodId_key" ON "staff_unavailability"("staffId", "day", "periodId");

-- AddForeignKey
ALTER TABLE "timetable_settings" ADD CONSTRAINT "timetable_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_unavailability" ADD CONSTRAINT "staff_unavailability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_unavailability" ADD CONSTRAINT "staff_unavailability_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_unavailability" ADD CONSTRAINT "staff_unavailability_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
