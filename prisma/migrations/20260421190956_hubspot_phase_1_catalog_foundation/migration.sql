-- CreateEnum
CREATE TYPE "HubSpotProductKind" AS ENUM ('PRODUCT', 'BUNDLE');

-- CreateEnum
CREATE TYPE "HubSpotReviewResolution" AS ENUM ('ACCEPT_HUBSPOT', 'REJECT', 'IGNORE');

-- AlterTable
ALTER TABLE "Bundle" ADD COLUMN     "hubspotProductId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "hubspotProductId" TEXT;

-- CreateTable
CREATE TABLE "HubSpotConfig" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "accessTokenSecretRef" TEXT NOT NULL,
    "lastPushAt" TIMESTAMP(3),
    "lastPullAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubSpotConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubSpotProductMap" (
    "id" TEXT NOT NULL,
    "pricerProductId" TEXT,
    "pricerBundleId" TEXT,
    "hubspotProductId" TEXT NOT NULL,
    "kind" "HubSpotProductKind" NOT NULL,
    "lastSyncedHash" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubSpotProductMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubSpotReviewQueueItem" (
    "id" TEXT NOT NULL,
    "entityType" "HubSpotProductKind" NOT NULL,
    "hubspotId" TEXT NOT NULL,
    "pricerEntityId" TEXT NOT NULL,
    "changedFields" JSONB NOT NULL,
    "changedFieldsHash" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" "HubSpotReviewResolution",
    "resolvedByUserId" TEXT,

    CONSTRAINT "HubSpotReviewQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotConfig_portalId_key" ON "HubSpotConfig"("portalId");

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotProductMap_pricerProductId_key" ON "HubSpotProductMap"("pricerProductId");

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotProductMap_pricerBundleId_key" ON "HubSpotProductMap"("pricerBundleId");

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotProductMap_hubspotProductId_key" ON "HubSpotProductMap"("hubspotProductId");

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotReviewQueueItem_entityType_hubspotId_changedFieldsHa_key" ON "HubSpotReviewQueueItem"("entityType", "hubspotId", "changedFieldsHash");

-- AddForeignKey
ALTER TABLE "HubSpotProductMap" ADD CONSTRAINT "HubSpotProductMap_pricerProductId_fkey" FOREIGN KEY ("pricerProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSpotProductMap" ADD CONSTRAINT "HubSpotProductMap_pricerBundleId_fkey" FOREIGN KEY ("pricerBundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
