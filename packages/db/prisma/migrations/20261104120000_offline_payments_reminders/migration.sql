-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "monthlyFeeUzs" INTEGER;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "reminderStage" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OfflinePayment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT,
    "month" TEXT NOT NULL,
    "amountUzs" INTEGER NOT NULL,
    "note" TEXT,
    "markedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflinePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfflinePayment_groupId_month_idx" ON "OfflinePayment"("groupId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "OfflinePayment_studentId_month_key" ON "OfflinePayment"("studentId", "month");

-- AddForeignKey
ALTER TABLE "OfflinePayment" ADD CONSTRAINT "OfflinePayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflinePayment" ADD CONSTRAINT "OfflinePayment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflinePayment" ADD CONSTRAINT "OfflinePayment_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

