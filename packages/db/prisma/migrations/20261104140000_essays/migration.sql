-- CreateEnum
CREATE TYPE "EssayMode" AS ENUM ('AI', 'TEACHER');

-- AlterTable
ALTER TABLE "Essay" ADD COLUMN     "error" TEXT,
ADD COLUMN     "mode" "EssayMode" NOT NULL DEFAULT 'AI',
ADD COLUMN     "priceUzs" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "essayId" TEXT,
ALTER COLUMN "planId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Essay_status_createdAt_idx" ON "Essay"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Essay_userId_createdAt_idx" ON "Essay"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_essayId_key" ON "Payment"("essayId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_essayId_fkey" FOREIGN KEY ("essayId") REFERENCES "Essay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

