-- CreateTable
CREATE TABLE "ResearchHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "keyword" TEXT NOT NULL,
    "volume" INTEGER NOT NULL,
    "competition" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "verdictReason" TEXT NOT NULL,
    "trendChange" INTEGER,
    "trendMonths" TEXT NOT NULL,
    "medianPrice" INTEGER,
    "minPrice" INTEGER,
    "maxPrice" INTEGER,
    "topKeywords" TEXT NOT NULL,
    "competitors" TEXT NOT NULL,
    "risks" TEXT NOT NULL,
    "searchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
