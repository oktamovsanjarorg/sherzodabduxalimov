-- Yangi enum qiymatlari alohida migratsiyada: Postgres ularni shu tranzaksiyaning o'zida ishlatishga ruxsat bermaydi
ALTER TYPE "EssayStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "EssayStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT';
ALTER TYPE "EssayStatus" ADD VALUE IF NOT EXISTS 'AI_FAILED';
