-- AlterTable
ALTER TABLE "ExternalEssay" ADD COLUMN     "review" JSONB,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "transcript" TEXT;

-- AlterTable
ALTER TABLE "GoldEssay" ADD COLUMN     "aiText" TEXT;

-- CreateIndex
CREATE INDEX "ExternalEssay_reviewedAt_idx" ON "ExternalEssay"("reviewedAt");

-- AddForeignKey
ALTER TABLE "ExternalEssay" ADD CONSTRAINT "ExternalEssay_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
