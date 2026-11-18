-- CreateTable
CREATE TABLE "AdvisorNote" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvisorNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdvisorNote_scope_createdAt_idx" ON "AdvisorNote"("scope", "createdAt");
