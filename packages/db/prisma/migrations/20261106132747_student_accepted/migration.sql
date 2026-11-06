-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "acceptedAt" TIMESTAMP(3);


-- Mavjud o'quvchilar: ko'rib chiqilgan deb hisoblanadi (yangi ro'yxat faqat bundan keyin kirganlar uchun)
UPDATE "StudentProfile" SET "acceptedAt" = "createdAt";
