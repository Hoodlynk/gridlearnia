-- CreateEnum
CREATE TYPE "SwapRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "timetable_swap_requests" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "timetableId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "targetEntryId" UUID,
    "targetDay" SMALLINT,
    "targetPeriodId" UUID,
    "reason" VARCHAR(500),
    "status" "SwapRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "decisionNote" VARCHAR(500),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_swap_requests_tenantId_idx" ON "timetable_swap_requests"("tenantId");

-- CreateIndex
CREATE INDEX "timetable_swap_requests_timetableId_status_idx" ON "timetable_swap_requests"("timetableId", "status");

-- CreateIndex
CREATE INDEX "timetable_swap_requests_requestedById_idx" ON "timetable_swap_requests"("requestedById");

-- AddForeignKey
ALTER TABLE "timetable_swap_requests" ADD CONSTRAINT "timetable_swap_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_swap_requests" ADD CONSTRAINT "timetable_swap_requests_timetableId_fkey" FOREIGN KEY ("timetableId") REFERENCES "timetables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_swap_requests" ADD CONSTRAINT "timetable_swap_requests_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "timetable_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_swap_requests" ADD CONSTRAINT "timetable_swap_requests_targetEntryId_fkey" FOREIGN KEY ("targetEntryId") REFERENCES "timetable_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_swap_requests" ADD CONSTRAINT "timetable_swap_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_swap_requests" ADD CONSTRAINT "timetable_swap_requests_targetPeriodId_fkey" FOREIGN KEY ("targetPeriodId") REFERENCES "periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
