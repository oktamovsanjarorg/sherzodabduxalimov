-- Offline test natijalari faqat CSV orqali import qilinadi: utest API manbasi olib tashlandi.
-- utest orqali import qilingan testlar (faqat staging'da bo'lgan) natijalari bilan birga o'chadi (ON DELETE CASCADE).
DELETE FROM "ExternalTest" WHERE "source" = 'UTEST';

-- AlterTable
ALTER TABLE "ExternalTest" DROP COLUMN "resultsVisible";
ALTER TABLE "ExternalResult" DROP COLUMN "telegramId";

-- AlterEnum: Postgres enum qiymatini o'chira olmaydi, shuning uchun tur qayta yaratiladi
ALTER TYPE "ExternalSource" RENAME TO "ExternalSource_old";
CREATE TYPE "ExternalSource" AS ENUM ('CSV');
ALTER TABLE "ExternalTest" ALTER COLUMN "source" TYPE "ExternalSource" USING ("source"::text::"ExternalSource");
DROP TYPE "ExternalSource_old";
