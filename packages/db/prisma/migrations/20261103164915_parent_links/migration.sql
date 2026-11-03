-- CreateEnum
CREATE TYPE "ParentLinkStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "ParentLink" ADD COLUMN     "flags" TEXT[],
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "relation" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "ParentLinkStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "ParentLink_status_idx" ON "ParentLink"("status");

-- AddForeignKey
ALTER TABLE "ParentLink" ADD CONSTRAINT "ParentLink_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

