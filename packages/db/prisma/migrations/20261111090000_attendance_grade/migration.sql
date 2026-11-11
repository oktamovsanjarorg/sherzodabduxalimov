-- Davomat: faqat Keldi/Kelmadi + dars bahosi. Kechikdi/Sababli eski yozuvlarda izohga o'tkaziladi (enum qiymatlari o'chirilmaydi)
ALTER TABLE "Attendance" ADD COLUMN "grade" INTEGER;
ALTER TABLE "Attendance" ADD COLUMN "corrected" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Attendance"
SET "note" = CASE WHEN "note" IS NULL OR "note" = '' THEN 'Kechikkan' ELSE 'Kechikkan: ' || "note" END,
    "status" = 'PRESENT'
WHERE "status" = 'LATE';

UPDATE "Attendance"
SET "note" = CASE WHEN "note" IS NULL OR "note" = '' THEN 'Sababli' ELSE 'Sababli: ' || "note" END,
    "status" = 'ABSENT'
WHERE "status" = 'EXCUSED';
