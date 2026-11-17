-- Tashqi testlar (utest): import qilingan test va natijalar
-- CreateEnum
CREATE TYPE "ExternalSource" AS ENUM ('UTEST', 'CSV');

-- CreateTable
CREATE TABLE "ExternalTest" (
    "id" TEXT NOT NULL,
    "source" "ExternalSource" NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "questionCount" INTEGER NOT NULL,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "resultsVisible" BOOLEAN NOT NULL DEFAULT true,
    "takenAt" TIMESTAMP(3),
    "importedById" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalResult" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "studentId" TEXT,
    "key" TEXT NOT NULL,
    "telegramId" BIGINT,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "manualMatch" BOOLEAN NOT NULL DEFAULT false,
    "correct" INTEGER NOT NULL,
    "wrong" INTEGER NOT NULL,
    "blank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "scaledScore" DOUBLE PRECISION,
    "grade" TEXT,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "answers" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTest_source_code_key" ON "ExternalTest"("source", "code");

-- CreateIndex
CREATE INDEX "ExternalResult_studentId_idx" ON "ExternalResult"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalResult_testId_key_key" ON "ExternalResult"("testId", "key");

-- AddForeignKey
ALTER TABLE "ExternalTest" ADD CONSTRAINT "ExternalTest_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResult" ADD CONSTRAINT "ExternalResult_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ExternalTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResult" ADD CONSTRAINT "ExternalResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

