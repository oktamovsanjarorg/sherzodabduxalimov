-- AlterTable
ALTER TABLE "AttemptAnswer" ADD COLUMN     "rubric" JSONB,
ADD COLUMN     "special" TEXT;

-- AlterTable
ALTER TABLE "EssayReview" ADD COLUMN     "special" TEXT;

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "raschAt" TIMESTAMP(3),
ADD COLUMN     "raschMu" DOUBLE PRECISION,
ADD COLUMN     "raschN" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "raschSigma" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "TestQuestion" ADD COLUMN     "raschB" DOUBLE PRECISION;

