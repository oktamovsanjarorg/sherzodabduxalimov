-- CreateEnum
CREATE TYPE "ExternalEssayStatus" AS ENUM ('DRAFT', 'CHECKING', 'CHECKED', 'FAILED');

-- AlterTable
ALTER TABLE "ExternalTest" ADD COLUMN     "essayPrompt" TEXT;

-- CreateTable
CREATE TABLE "ExternalEssay" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "imageUrls" TEXT[],
    "status" "ExternalEssayStatus" NOT NULL DEFAULT 'DRAFT',
    "text" TEXT,
    "prompt" TEXT,
    "ai" JSONB,
    "error" TEXT,
    "aiError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalEssay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalEssay_resultId_key" ON "ExternalEssay"("resultId");

-- CreateIndex
CREATE INDEX "ExternalEssay_status_idx" ON "ExternalEssay"("status");

-- AddForeignKey
ALTER TABLE "ExternalEssay" ADD CONSTRAINT "ExternalEssay_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "ExternalResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
