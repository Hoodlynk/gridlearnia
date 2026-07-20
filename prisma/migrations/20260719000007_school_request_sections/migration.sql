-- AlterTable: the education bands chosen during onboarding (become Sections
-- on approval). Existing requests default to an empty list.
ALTER TABLE "school_requests" ADD COLUMN "sections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
