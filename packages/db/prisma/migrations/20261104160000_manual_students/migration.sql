-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "inviteCode" TEXT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "telegramId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_inviteCode_key" ON "StudentProfile"("inviteCode");

