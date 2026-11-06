-- CreateTable
CREATE TABLE "TrashItem" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "setNull" JSONB NOT NULL DEFAULT '[]',
    "files" TEXT[],
    "videoIds" TEXT[],
    "rows" INTEGER NOT NULL DEFAULT 0,
    "deletedById" TEXT,
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrashItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrashItem_purgeAt_idx" ON "TrashItem"("purgeAt");

