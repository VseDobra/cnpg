-- CreateTable
CREATE TABLE "ScraperRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword" TEXT NOT NULL,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verdictLevel" TEXT NOT NULL,
    "verdictText" TEXT NOT NULL,
    "metrics" TEXT NOT NULL,
    "reasons" TEXT NOT NULL,
    "sheetTabs" TEXT,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "productCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "ScrapedProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "originalPrice" INTEGER NOT NULL,
    "discountPct" INTEGER NOT NULL,
    "couponDiscount" INTEGER NOT NULL,
    "rating" REAL NOT NULL,
    "reviewCount" INTEGER NOT NULL,
    "imageCount" INTEGER NOT NULL,
    "firstImage" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "seller" TEXT NOT NULL,
    "isRocket" BOOLEAN NOT NULL DEFAULT false,
    "isWow" BOOLEAN NOT NULL DEFAULT false,
    "recentBuyers" INTEGER,
    "searchRank" INTEGER,
    CONSTRAINT "ScrapedProduct_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScraperRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScrapedReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "reviewedAt" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "helpful" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "photos" TEXT NOT NULL,
    CONSTRAINT "ScrapedReview_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScraperRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScrapedQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "askedAt" TEXT,
    "answeredAt" TEXT,
    CONSTRAINT "ScrapedQuestion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScraperRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScrapedTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ScrapedTag_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScraperRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScrapedTopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "quotes" TEXT NOT NULL,
    "reviewIds" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ScrapedTopic_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScraperRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScrapedProduct_runId_idx" ON "ScrapedProduct"("runId");

-- CreateIndex
CREATE INDEX "ScrapedReview_runId_idx" ON "ScrapedReview"("runId");

-- CreateIndex
CREATE INDEX "ScrapedReview_runId_productId_idx" ON "ScrapedReview"("runId", "productId");

-- CreateIndex
CREATE INDEX "ScrapedQuestion_runId_idx" ON "ScrapedQuestion"("runId");

-- CreateIndex
CREATE INDEX "ScrapedTag_runId_idx" ON "ScrapedTag"("runId");

-- CreateIndex
CREATE INDEX "ScrapedTopic_runId_idx" ON "ScrapedTopic"("runId");
