-- CreateTable
CREATE TABLE "RerunQueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedRunId" TEXT,
    "completedAt" DATETIME,
    "reason" TEXT
);

-- CreateIndex
CREATE INDEX "RerunQueueItem_status_idx" ON "RerunQueueItem"("status");

-- CreateIndex
CREATE INDEX "RerunQueueItem_keyword_idx" ON "RerunQueueItem"("keyword");
