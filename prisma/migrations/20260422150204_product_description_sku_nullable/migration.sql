-- AlterTable
ALTER TABLE "Bundle" ADD COLUMN     "sku" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "description" TEXT,
ADD COLUMN     "sku" TEXT;
