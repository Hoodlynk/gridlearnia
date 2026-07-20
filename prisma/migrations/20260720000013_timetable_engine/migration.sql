-- CreateEnum
CREATE TYPE "TimetableRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "timetableId" UUID NOT NULL,
    "classId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "roomId" UUID,
    "day" SMALLINT NOT NULL,
    "periodId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_runs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "timetableId" UUID NOT NULL,
    "status" "TimetableRunStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" SMALLINT NOT NULL DEFAULT 0,
    "message" VARCHAR(500),
    "metrics" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_entries_timetableId_idx" ON "timetable_entries"("timetableId");

-- CreateIndex
CREATE INDEX "timetable_entries_timetableId_staffId_idx" ON "timetable_entries"("timetableId", "staffId");

-- CreateIndex
CREATE INDEX "timetable_entries_tenantId_idx" ON "timetable_entries"("tenantId");

-- CreateIndex: a class can hold only one lesson per slot
CREATE UNIQUE INDEX "timetable_entries_timetableId_classId_day_periodId_key" ON "timetable_entries"("timetableId", "classId", "day", "periodId");

-- CreateIndex: a teacher can hold only one lesson per slot
CREATE UNIQUE INDEX "timetable_entries_timetableId_staffId_day_periodId_key" ON "timetable_entries"("timetableId", "staffId", "day", "periodId");

-- CreateIndex: a room can hold only one lesson per slot. Partial, because
-- roomId is nullable and Postgres treats NULLs as distinct.
CREATE UNIQUE INDEX "timetable_entries_room_slot_unique" ON "timetable_entries"("timetableId", "roomId", "day", "periodId") WHERE "roomId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "timetable_runs_tenantId_idx" ON "timetable_runs"("tenantId");

-- CreateIndex
CREATE INDEX "timetable_runs_timetableId_idx" ON "timetable_runs"("timetableId");

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_runs" ADD CONSTRAINT "timetable_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_runs" ADD CONSTRAINT "timetable_runs_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
