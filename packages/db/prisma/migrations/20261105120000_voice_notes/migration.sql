-- CreateEnum
CREATE TYPE "VoiceStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "VoiceNote" (
    "id" TEXT NOT NULL,
    "essayId" TEXT,
    "attemptId" TEXT,
    "questionId" TEXT,
    "originalPath" TEXT NOT NULL,
    "oggPath" TEXT,
    "m4aPath" TEXT,
    "durationSec" INTEGER,
    "status" "VoiceStatus" NOT NULL DEFAULT 'PROCESSING',
    "error" TEXT,
    "createdById" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceNote_essayId_key" ON "VoiceNote"("essayId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceNote_attemptId_questionId_key" ON "VoiceNote"("attemptId", "questionId");

-- AddForeignKey
ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_essayId_fkey" FOREIGN KEY ("essayId") REFERENCES "Essay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

