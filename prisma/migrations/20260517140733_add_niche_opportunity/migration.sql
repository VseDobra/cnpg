-- CreateTable
CREATE TABLE "NicheOpportunity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "keyword" TEXT NOT NULL,
    "volume" INTEGER NOT NULL,
    "competition" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "trendChange" INTEGER,
    "medianPrice" INTEGER,
    "topKeywords" TEXT NOT NULL,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
