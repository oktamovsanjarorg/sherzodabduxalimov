-- To'lov davri: har o'quvchining o'z sanasidan. Ustunlar ixtiyoriy; eski yozuvlar butun oy deb hisoblanadi
ALTER TABLE "OfflinePayment" ADD COLUMN "periodStart" DATE;
ALTER TABLE "OfflinePayment" ADD COLUMN "periodEnd" DATE;
ALTER TABLE "OfflinePayment" ADD COLUMN "paidOn" DATE;

UPDATE "OfflinePayment"
SET "periodStart" = to_date("month" || '-01', 'YYYY-MM-DD'),
    "periodEnd"   = (to_date("month" || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date,
    "paidOn"      = ("createdAt" + interval '5 hours')::date;

CREATE INDEX "OfflinePayment_studentId_periodEnd_idx" ON "OfflinePayment"("studentId", "periodEnd");
