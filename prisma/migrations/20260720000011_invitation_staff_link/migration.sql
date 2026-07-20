-- AlterTable
ALTER TABLE "invitations" ADD COLUMN "staffId" UUID;

-- CreateIndex
CREATE INDEX "invitations_staffId_idx" ON "invitations"("staffId");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
