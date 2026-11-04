-- CreateEnum
CREATE TYPE "StudentAccess" AS ENUM ('AUTO', 'FREE', 'CLOSED');

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "accessMode" "StudentAccess" NOT NULL DEFAULT 'AUTO';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blockedReason" TEXT;

