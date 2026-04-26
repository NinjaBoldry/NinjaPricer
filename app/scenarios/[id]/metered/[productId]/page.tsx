import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import { MeteredPricingService } from '@/lib/services/meteredPricing';
import MeteredTabForm from '@/components/scenarios/MeteredTabForm';
import { upsertMeteredSaaSConfigAction } from './actions';

export default async function MeteredTabPage({
  params,
}: {
  params: { id: string; productId: string };
}) {
  const repo = new ScenarioRepository(prisma);
  const scenario = await repo.findById(params.id);
  if (!scenario) notFound();

  const product = await prisma.product.findUnique({
    where: { id: params.productId },
    select: { id: true, name: true, kind: true, revenueModel: true, isActive: true },
  });
  if (!product || !product.isActive) notFound();
  if (product.kind !== 'SAAS_USAGE' || product.revenueModel !== 'METERED') notFound();

  const meteredService = new MeteredPricingService(prisma);
  const pricing = await meteredService.get(params.productId);
  if (!pricing) {
    return (
      <p className="text-sm text-slate-500">
        No metered pricing configured for this product. An admin must set it before this tab can be
        used.
      </p>
    );
  }

  const saasConfig = await prisma.scenarioSaaSConfig.findUnique({
    where: {
      scenarioId_productId: { scenarioId: params.id, productId: params.productId },
    },
    select: {
      committedUnitsPerMonth: true,
      expectedActualUnitsPerMonth: true,
    },
  });

  const initialCommitted =
    saasConfig?.committedUnitsPerMonth ?? pricing.includedUnitsPerMonth;
  const initialExpected = saasConfig?.expectedActualUnitsPerMonth ?? initialCommitted;

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold mb-1">{product.name}</h2>
      <p className="text-sm text-slate-500 mb-4">
        Metered SaaS &mdash; priced per {pricing.unitLabel}
      </p>
      <MeteredTabForm
        scenarioId={params.id}
        productId={product.id}
        contractMonths={scenario.contractMonths}
        pricing={{
          unitLabel: pricing.unitLabel,
          includedUnitsPerMonth: pricing.includedUnitsPerMonth,
          committedMonthlyUsd: pricing.committedMonthlyUsd.toString(),
          overageRatePerUnitUsd: pricing.overageRatePerUnitUsd.toString(),
        }}
        initialCommittedUnitsPerMonth={initialCommitted}
        initialExpectedActualUnitsPerMonth={initialExpected}
        saveAction={upsertMeteredSaaSConfigAction}
      />
    </div>
  );
}
