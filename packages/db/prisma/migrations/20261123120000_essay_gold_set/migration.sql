-- CreateTable
CREATE TABLE "GoldEssay" (
    "id" TEXT NOT NULL,
    "essayId" TEXT,
    "topic" TEXT NOT NULL,
    "imageUrls" TEXT[],
    "transcript" TEXT,
    "marks" JSONB NOT NULL DEFAULT '[]',
    "transcribedById" TEXT,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldEssay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldRating" (
    "id" TEXT NOT NULL,
    "goldEssayId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "special" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoldEssay_essayId_key" ON "GoldEssay"("essayId");

-- CreateIndex
CREATE INDEX "GoldEssay_createdAt_idx" ON "GoldEssay"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoldRating_goldEssayId_raterId_key" ON "GoldRating"("goldEssayId", "raterId");

-- AddForeignKey
ALTER TABLE "GoldEssay" ADD CONSTRAINT "GoldEssay_transcribedById_fkey" FOREIGN KEY ("transcribedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldEssay" ADD CONSTRAINT "GoldEssay_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldRating" ADD CONSTRAINT "GoldRating_goldEssayId_fkey" FOREIGN KEY ("goldEssayId") REFERENCES "GoldEssay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldRating" ADD CONSTRAINT "GoldRating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

