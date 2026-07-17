-- CreateEnum
CREATE TYPE "SchoolRequestDocumentType" AS ENUM ('ID_DOCUMENT', 'SCHOOL_CERTIFICATE');

-- AlterTable
ALTER TABLE "school_requests" ADD COLUMN     "applicantFullName" VARCHAR(255),
ADD COLUMN     "idNumber" VARCHAR(50),
ADD COLUMN     "phone" VARCHAR(30);

-- CreateTable
CREATE TABLE "school_request_documents" (
    "id" UUID NOT NULL,
    "schoolRequestId" UUID NOT NULL,
    "type" "SchoolRequestDocumentType" NOT NULL,
    "fileKey" VARCHAR(512) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_request_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_request_documents_schoolRequestId_idx" ON "school_request_documents"("schoolRequestId");

-- AddForeignKey
ALTER TABLE "school_request_documents" ADD CONSTRAINT "school_request_documents_schoolRequestId_fkey" FOREIGN KEY ("schoolRequestId") REFERENCES "school_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
