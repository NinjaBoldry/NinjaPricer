-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "hubspotCompanyName" TEXT,
ADD COLUMN     "hubspotDealName" TEXT,
ADD COLUMN     "hubspotDealStage" TEXT,
ADD COLUMN     "hubspotSnapshotAt" TIMESTAMP(3);
