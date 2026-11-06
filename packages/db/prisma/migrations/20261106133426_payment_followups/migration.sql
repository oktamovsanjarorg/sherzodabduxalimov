-- CreateEnum
CREATE TYPE "FollowUpKind" AS ENUM ('CALL', 'MESSAGE', 'PROMISE', 'REASON', 'BOT');

-- CreateTable
CREATE TABLE "PaymentFollowUp" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "kind" "FollowUpKind" NOT NULL,
    "note" TEXT,
    "promisedAt" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentFollowUp_month_studentId_idx" ON "PaymentFollowUp"("month", "studentId");

-- AddForeignKey
ALTER TABLE "PaymentFollowUp" ADD CONSTRAINT "PaymentFollowUp_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentFollowUp" ADD CONSTRAINT "PaymentFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

