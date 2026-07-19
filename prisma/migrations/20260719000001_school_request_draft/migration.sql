-- Draft applications: saved before documents are complete, submitted for
-- review (-> PENDING) later.
ALTER TYPE "SchoolRequestStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'PENDING';
