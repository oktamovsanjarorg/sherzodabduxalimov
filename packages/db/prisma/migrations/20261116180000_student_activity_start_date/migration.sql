-- O'quvchi faolligi: botga ulangan, botga va ilovaga oxirgi kirgan payt
ALTER TABLE "User" ADD COLUMN "botJoinedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastBotAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastAppAt" TIMESTAMP(3);

-- O'qishni boshlagan sana
ALTER TABLE "StudentProfile" ADD COLUMN "startedOn" DATE;

-- Mavjud yozuvlar: botga ulangan payt ~ yaratilgan payt (aniqrog'i saqlanmagan)
UPDATE "User" SET "botJoinedAt" = "createdAt" WHERE "telegramId" IS NOT NULL;

-- Mavjud o'quvchilar: birinchi offline to'lov davrining boshi (davr yo'q eski yozuvda oyning 1-kuni)
UPDATE "StudentProfile" sp SET "startedOn" = f.first_day
FROM (
  SELECT "studentId", MIN(COALESCE("periodStart", to_date("month" || '-01', 'YYYY-MM-DD'))) AS first_day
  FROM "OfflinePayment" GROUP BY "studentId"
) f
WHERE f."studentId" = sp."id";
