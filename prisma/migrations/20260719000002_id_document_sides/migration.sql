-- Identity-document kind on the request (national ID vs passport) and the
-- scanned side on each document (front/back for national IDs).
CREATE TYPE "IdDocumentType" AS ENUM ('NATIONAL_ID', 'PASSPORT');
CREATE TYPE "DocumentSide" AS ENUM ('FRONT', 'BACK');

ALTER TABLE "school_requests" ADD COLUMN "idType" "IdDocumentType";
ALTER TABLE "school_request_documents" ADD COLUMN "side" "DocumentSide";
