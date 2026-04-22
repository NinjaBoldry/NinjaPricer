-- CreateEnum
CREATE TYPE "HubSpotPublishState" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHING', 'PUBLISHED', 'SUPERSEDED', 'FAILED', 'APPROVAL_REJECTED');

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "hubspotQuoteId" TEXT,
ADD COLUMN     "publishState" "HubSpotPublishState" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "hubspotCompanyId" TEXT,
ADD COLUMN     "hubspotDealId" TEXT,
ADD COLUMN     "hubspotPrimaryContactId" TEXT;

-- CreateTable
CREATE TABLE "HubSpotQuote" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "hubspotQuoteId" TEXT NOT NULL,
    "shareableUrl" TEXT,
    "publishState" "HubSpotPublishState" NOT NULL,
    "supersedesQuoteId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastStatusAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "dealOutcomeAt" TIMESTAMP(3),
    "dealOutcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubSpotQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubSpotWebhookEvent" (
    "id" TEXT NOT NULL,
    "hubspotEventId" TEXT NOT NULL,
    "subscriptionType" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HubSpotWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotQuote_hubspotQuoteId_key" ON "HubSpotQuote"("hubspotQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotQuote_supersedesQuoteId_key" ON "HubSpotQuote"("supersedesQuoteId");

-- CreateIndex
CREATE INDEX "HubSpotQuote_scenarioId_idx" ON "HubSpotQuote"("scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotQuote_scenarioId_revision_key" ON "HubSpotQuote"("scenarioId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotWebhookEvent_hubspotEventId_key" ON "HubSpotWebhookEvent"("hubspotEventId");

-- CreateIndex
CREATE INDEX "HubSpotWebhookEvent_processedAt_idx" ON "HubSpotWebhookEvent"("processedAt");

-- AddForeignKey
ALTER TABLE "HubSpotQuote" ADD CONSTRAINT "HubSpotQuote_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotQuote" ADD CONSTRAINT "HubSpotQuote_supersedesQuoteId_fkey" FOREIGN KEY ("supersedesQuoteId") REFERENCES "HubSpotQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
