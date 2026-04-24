-- CreateEnum
CREATE TYPE "SaaSRevenueModel" AS ENUM ('PER_SEAT', 'METERED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "revenueModel" "SaaSRevenueModel" NOT NULL DEFAULT 'PER_SEAT';

-- AlterTable
ALTER TABLE "ScenarioSaaSConfig" ADD COLUMN     "committedUnitsPerMonth" INTEGER,
ADD COLUMN     "expectedActualUnitsPerMonth" INTEGER;

-- CreateTable
CREATE TABLE "MeteredPricing" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "includedUnitsPerMonth" INTEGER NOT NULL,
    "committedMonthlyUsd" DECIMAL(18,4) NOT NULL,
    "overageRatePerUnitUsd" DECIMAL(18,6) NOT NULL,
    "costPerUnitUsd" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeteredPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeteredPricing_productId_key" ON "MeteredPricing"("productId");

-- AddForeignKey
ALTER TABLE "MeteredPricing" ADD CONSTRAINT "MeteredPricing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
