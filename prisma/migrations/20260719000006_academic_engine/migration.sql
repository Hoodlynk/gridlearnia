-- CreateEnum
CREATE TYPE "GradingSchemeType" AS ENUM ('PERCENTAGE', 'LETTER', 'POINTS', 'COMPETENCY', 'PASS_FAIL');

-- CreateTable
CREATE TABLE "curricula" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "country" VARCHAR(2),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "curriculumId" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_schemes" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "type" "GradingSchemeType" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grading_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_bands" (
    "id" UUID NOT NULL,
    "schemeId" UUID NOT NULL,
    "label" VARCHAR(30) NOT NULL,
    "order" INTEGER NOT NULL,
    "minScore" DECIMAL(5,2),
    "maxScore" DECIMAL(5,2),
    "points" DECIMAL(4,2),
    "remark" VARCHAR(100),

    CONSTRAINT "grading_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_terms" (
    "id" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "order" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,

    CONSTRAINT "academic_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "campusId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "curriculumId" UUID,
    "gradingSchemeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "campusId" UUID NOT NULL,
    "gradeId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "curricula_tenantId_idx" ON "curricula"("tenantId");
CREATE UNIQUE INDEX "curricula_tenantId_key_key" ON "curricula"("tenantId", "key");
-- System curricula (tenantId IS NULL) must have globally unique keys.
-- Postgres treats NULLs as distinct, so the composite unique above does not
-- cover them — this partial index does.
CREATE UNIQUE INDEX "curricula_system_key_unique" ON "curricula"("key") WHERE "tenantId" IS NULL;

-- CreateIndex
CREATE INDEX "subjects_curriculumId_idx" ON "subjects"("curriculumId");
CREATE INDEX "subjects_tenantId_idx" ON "subjects"("tenantId");
CREATE UNIQUE INDEX "subjects_curriculumId_code_key" ON "subjects"("curriculumId", "code");

-- CreateIndex
CREATE INDEX "grading_schemes_tenantId_idx" ON "grading_schemes"("tenantId");
CREATE UNIQUE INDEX "grading_schemes_tenantId_key_key" ON "grading_schemes"("tenantId", "key");
-- Same NULL-key rule as curricula.
CREATE UNIQUE INDEX "grading_schemes_system_key_unique" ON "grading_schemes"("key") WHERE "tenantId" IS NULL;

-- CreateIndex
CREATE INDEX "grading_bands_schemeId_idx" ON "grading_bands"("schemeId");
CREATE UNIQUE INDEX "grading_bands_schemeId_order_key" ON "grading_bands"("schemeId", "order");

-- CreateIndex
CREATE INDEX "academic_years_tenantId_idx" ON "academic_years"("tenantId");
CREATE UNIQUE INDEX "academic_years_tenantId_name_key" ON "academic_years"("tenantId", "name");

-- CreateIndex
CREATE INDEX "academic_terms_academicYearId_idx" ON "academic_terms"("academicYearId");
CREATE UNIQUE INDEX "academic_terms_academicYearId_order_key" ON "academic_terms"("academicYearId", "order");

-- CreateIndex
CREATE INDEX "sections_tenantId_idx" ON "sections"("tenantId");
CREATE INDEX "sections_campusId_idx" ON "sections"("campusId");

-- CreateIndex
CREATE INDEX "grades_tenantId_idx" ON "grades"("tenantId");
CREATE INDEX "grades_sectionId_idx" ON "grades"("sectionId");

-- CreateIndex
CREATE INDEX "classes_tenantId_idx" ON "classes"("tenantId");
CREATE INDEX "classes_gradeId_idx" ON "classes"("gradeId");
CREATE INDEX "classes_academicYearId_idx" ON "classes"("academicYearId");

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "curricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_schemes" ADD CONSTRAINT "grading_schemes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_bands" ADD CONSTRAINT "grading_bands_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "grading_schemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sections" ADD CONSTRAINT "sections_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sections" ADD CONSTRAINT "sections_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "curricula"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sections" ADD CONSTRAINT "sections_gradingSchemeId_fkey" FOREIGN KEY ("gradingSchemeId") REFERENCES "grading_schemes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grades" ADD CONSTRAINT "grades_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "classes" ADD CONSTRAINT "classes_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "classes" ADD CONSTRAINT "classes_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "classes" ADD CONSTRAINT "classes_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
