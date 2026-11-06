-- CreateTable
CREATE TABLE "PendingParent" (
    "telegramId" BIGINT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingParent_pkey" PRIMARY KEY ("telegramId")
);

