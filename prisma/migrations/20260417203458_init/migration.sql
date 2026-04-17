-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SALES');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('SAAS_USAGE', 'PACKAGED_LABOR', 'CUSTOM_LABOR');

-- CreateEnum
CREATE TYPE "LaborSKUUnit" AS ENUM ('PER_USER', 'PER_SESSION', 'PER_DAY', 'FIXED');

-- CreateEnum
CREATE TYPE "BurdenScope" AS ENUM ('ALL_DEPARTMENTS', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "EmployeeCompensationType" AS ENUM ('ANNUAL_SALARY', 'HOURLY');

-- CreateEnum
CREATE TYPE "CommissionScopeType" AS ENUM ('ALL', 'PRODUCT', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "CommissionBaseMetric" AS ENUM ('REVENUE', 'CONTRIBUTION_MARGIN', 'TAB_REVENUE', 'TAB_MARGIN');

-- CreateEnum
CREATE TYPE "RailKind" AS ENUM ('MIN_MARGIN_PCT', 'MAX_DISCOUNT_PCT', 'MIN_SEAT_PRICE', 'MIN_CONTRACT_MONTHS');

-- CreateEnum
CREATE TYPE "MarginBasis" AS ENUM ('CONTRIBUTION', 'NET');

-- CreateEnum
CREATE TYPE "ScenarioStatus" AS ENUM ('DRAFT', 'QUOTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SALES',
    "microsoftSub" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ProductKind" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorRate" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "rateUsd" DECIMAL(18,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseUsage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "vendorRateId" TEXT NOT NULL,
    "usagePerMonth" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "BaseUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtherVariable" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "usdPerUserPerMonth" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "OtherVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "multiplier" DECIMAL(10,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFixedCost" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyUsd" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "ProductFixedCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductScale" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "activeUsersAtScale" INTEGER NOT NULL,

    CONSTRAINT "ProductScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "usdPerSeatPerMonth" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "ListPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumeDiscountTier" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "minSeats" INTEGER NOT NULL,
    "discountPct" DECIMAL(6,4) NOT NULL,

    CONSTRAINT "VolumeDiscountTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractLengthModifier" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "minMonths" INTEGER NOT NULL,
    "additionalDiscountPct" DECIMAL(6,4) NOT NULL,

    CONSTRAINT "ContractLengthModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborSKU" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "LaborSKUUnit" NOT NULL,
    "costPerUnitUsd" DECIMAL(18,4) NOT NULL,
    "defaultRevenueUsd" DECIMAL(18,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LaborSKU_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Burden" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratePct" DECIMAL(6,4) NOT NULL,
    "capUsd" DECIMAL(18,2),
    "scope" "BurdenScope" NOT NULL,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Burden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "compensationType" "EmployeeCompensationType" NOT NULL,
    "annualSalaryUsd" DECIMAL(18,2),
    "hourlyRateUsd" DECIMAL(18,4),
    "standardHoursPerYear" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentBillRate" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "billRatePerHour" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "DepartmentBillRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopeType" "CommissionScopeType" NOT NULL,
    "scopeProductId" TEXT,
    "scopeDepartmentId" TEXT,
    "baseMetric" "CommissionBaseMetric" NOT NULL,
    "recipientEmployeeId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionTier" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "thresholdFromUsd" DECIMAL(18,2) NOT NULL,
    "ratePct" DECIMAL(6,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleItem" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "skuId" TEXT,
    "departmentId" TEXT,
    "config" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rail" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "RailKind" NOT NULL,
    "marginBasis" "MarginBasis" NOT NULL DEFAULT 'CONTRIBUTION',
    "softThreshold" DECIMAL(18,4) NOT NULL,
    "hardThreshold" DECIMAL(18,4) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Rail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "contractMonths" INTEGER NOT NULL,
    "appliedBundleId" TEXT,
    "notes" TEXT,
    "status" "ScenarioStatus" NOT NULL DEFAULT 'DRAFT',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioSaaSConfig" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "seatCount" INTEGER NOT NULL,
    "personaMix" JSONB NOT NULL,
    "discountOverridePct" DECIMAL(6,4),

    CONSTRAINT "ScenarioSaaSConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioLaborLine" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "skuId" TEXT,
    "departmentId" TEXT,
    "customDescription" TEXT,
    "qty" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "costPerUnitUsd" DECIMAL(18,4) NOT NULL,
    "revenuePerUnitUsd" DECIMAL(18,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScenarioLaborLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "internalPdfUrl" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT NOT NULL,
    "customerSnapshot" JSONB NOT NULL,
    "totals" JSONB NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_microsoftSub_key" ON "User"("microsoftSub");

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "VendorRate_productId_name_key" ON "VendorRate"("productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BaseUsage_productId_vendorRateId_key" ON "BaseUsage"("productId", "vendorRateId");

-- CreateIndex
CREATE UNIQUE INDEX "OtherVariable_productId_key" ON "OtherVariable"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_productId_name_key" ON "Persona"("productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFixedCost_productId_name_key" ON "ProductFixedCost"("productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductScale_productId_key" ON "ProductScale"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ListPrice_productId_key" ON "ListPrice"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "VolumeDiscountTier_productId_minSeats_key" ON "VolumeDiscountTier"("productId", "minSeats");

-- CreateIndex
CREATE UNIQUE INDEX "ContractLengthModifier_productId_minMonths_key" ON "ContractLengthModifier"("productId", "minMonths");

-- CreateIndex
CREATE UNIQUE INDEX "LaborSKU_productId_name_key" ON "LaborSKU"("productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Burden_name_key" ON "Burden"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentBillRate_departmentId_key" ON "DepartmentBillRate"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionTier_ruleId_thresholdFromUsd_key" ON "CommissionTier"("ruleId", "thresholdFromUsd");

-- CreateIndex
CREATE UNIQUE INDEX "Bundle_name_key" ON "Bundle"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioSaaSConfig_scenarioId_productId_key" ON "ScenarioSaaSConfig"("scenarioId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_scenarioId_version_key" ON "Quote"("scenarioId", "version");

-- AddForeignKey
ALTER TABLE "VendorRate" ADD CONSTRAINT "VendorRate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseUsage" ADD CONSTRAINT "BaseUsage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseUsage" ADD CONSTRAINT "BaseUsage_vendorRateId_fkey" FOREIGN KEY ("vendorRateId") REFERENCES "VendorRate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherVariable" ADD CONSTRAINT "OtherVariable_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFixedCost" ADD CONSTRAINT "ProductFixedCost_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductScale" ADD CONSTRAINT "ProductScale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListPrice" ADD CONSTRAINT "ListPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeDiscountTier" ADD CONSTRAINT "VolumeDiscountTier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLengthModifier" ADD CONSTRAINT "ContractLengthModifier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborSKU" ADD CONSTRAINT "LaborSKU_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Burden" ADD CONSTRAINT "Burden_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentBillRate" ADD CONSTRAINT "DepartmentBillRate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_scopeProductId_fkey" FOREIGN KEY ("scopeProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_scopeDepartmentId_fkey" FOREIGN KEY ("scopeDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_recipientEmployeeId_fkey" FOREIGN KEY ("recipientEmployeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionTier" ADD CONSTRAINT "CommissionTier_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CommissionRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "LaborSKU"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rail" ADD CONSTRAINT "Rail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_appliedBundleId_fkey" FOREIGN KEY ("appliedBundleId") REFERENCES "Bundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioSaaSConfig" ADD CONSTRAINT "ScenarioSaaSConfig_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioSaaSConfig" ADD CONSTRAINT "ScenarioSaaSConfig_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioLaborLine" ADD CONSTRAINT "ScenarioLaborLine_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioLaborLine" ADD CONSTRAINT "ScenarioLaborLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioLaborLine" ADD CONSTRAINT "ScenarioLaborLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "LaborSKU"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioLaborLine" ADD CONSTRAINT "ScenarioLaborLine_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
