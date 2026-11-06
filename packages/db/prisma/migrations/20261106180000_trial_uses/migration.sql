-- Cheklangan rejim: har bo'limdan bir martalik foydalanish yozuvi
CREATE TYPE "TrialKind" AS ENUM ('LESSON', 'TOPIC_TEST', 'MOCK', 'ESSAY');

CREATE TABLE "TrialUse" (
    "userId" TEXT NOT NULL,
    "kind" "TrialKind" NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialUse_pkey" PRIMARY KEY ("userId","kind")
);

ALTER TABLE "TrialUse" ADD CONSTRAINT "TrialUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ustoz guruhga qo'shgan o'quvchi ko'rib chiqilgan hisoblanadi (avval bu yo'lda belgi qo'yilmagan)
UPDATE "StudentProfile" SET "acceptedAt" = CURRENT_TIMESTAMP WHERE "groupId" IS NOT NULL AND "acceptedAt" IS NULL;
