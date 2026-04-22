-- CreateEnum
CREATE TYPE "HubSpotApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "HubSpotApprovalRequest" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "hubspotDealId" TEXT NOT NULL,
    "railViolations" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "HubSpotApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolvedByHubspotOwnerId" TEXT,

    CONSTRAINT "HubSpotApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HubSpotApprovalRequest_scenarioId_key" ON "HubSpotApprovalRequest"("scenarioId");

-- AddForeignKey
ALTER TABLE "HubSpotApprovalRequest" ADD CONSTRAINT "HubSpotApprovalRequest_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
