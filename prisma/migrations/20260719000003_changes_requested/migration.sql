-- Review outcome asking the applicant to correct and resubmit (comments in
-- `reason`) — unlike REJECTED, the request stays editable.
ALTER TYPE "SchoolRequestStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED' BEFORE 'APPROVED';
