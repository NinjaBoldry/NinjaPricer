import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';
import { MeteredPricingService } from '@/lib/services/meteredPricing';
import { MeteredPricingForm, type MeteredPricingInitial } from './MeteredPricingForm';

export default async function MeteredPricingPage({
  params,
}: {
  params: { id: string };
}) {
  const product = await new ProductRepository(prisma).findById(params.id);
  if (!product) notFound();
  if (product.revenueModel !== 'METERED') notFound();

  const row = await new MeteredPricingService(prisma).get(params.id);
  const initial: MeteredPricingInitial | null = row
    ? {
        unitLabel: row.unitLabel,
        includedUnitsPerMonth: row.includedUnitsPerMonth,
        committedMonthlyUsd: row.committedMonthlyUsd.toString(),
        overageRatePerUnitUsd: row.overageRatePerUnitUsd.toString(),
        costPerUnitUsd: row.costPerUnitUsd.toString(),
      }
    : null;

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin/products" className="hover:underline">
          Products
        </Link>
        <span>/</span>
        <Link href={`/admin/products/${params.id}`} className="hover:underline">
          {product.name}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Metered Pricing</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Metered Pricing</h1>

      <MeteredPricingForm productId={params.id} initial={initial} />
    </div>
  );
}
