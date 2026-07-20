-- CreateTable
CREATE TABLE "login_two_factor_codes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_two_factor_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_two_factor_codes_userId_idx" ON "login_two_factor_codes"("userId");

-- AddForeignKey
ALTER TABLE "login_two_factor_codes" ADD CONSTRAINT "login_two_factor_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
