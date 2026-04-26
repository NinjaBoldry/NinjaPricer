import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import ScenarioHeader from '@/components/scenarios/ScenarioHeader';
import ScenarioBuilderClient from '@/components/scenarios/ScenarioBuilderClient';
import ScenarioTabNav from '@/components/scenarios/ScenarioTabNav';
import { archiveScenarioAction } from './archive-action';

export default async function ScenarioBuilderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const user = await requireAuth();
  const repo = new ScenarioRepository(prisma);
  const [scenario, bundles] = await Promise.all([
    repo.findById(params.id),
    prisma.bundle.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (!scenario) notFound();
  if (user.role === 'SALES' && scenario.ownerId !== user.id) notFound();

  // Phase 6: each METERED SaaS product on the scenario gets its own tab in the
  // left nav, alongside the hardcoded singleton "Notes" tab (PER_SEAT today).
  const meteredProducts = await prisma.product.findMany({
    where: {
      isActive: true,
      kind: 'SAAS_USAGE',
      revenueModel: 'METERED',
      scenarioSaaSConfigs: { some: { scenarioId: params.id } },
    },
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  });

  return (
    <div className="flex flex-col min-h-screen">
      <ScenarioHeader
        scenarioId={params.id}
        name={scenario.name}
        customerName={scenario.customerName}
        contractMonths={scenario.contractMonths}
        status={scenario.status}
        archiveAction={archiveScenarioAction}
      />
      <ScenarioBuilderClient
        scenarioId={params.id}
        userRole={user.role}
        bundles={bundles}
        appliedBundleId={scenario.appliedBundleId}
      >
        <ScenarioTabNav scenarioId={params.id} meteredProducts={meteredProducts} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </ScenarioBuilderClient>
    </div>
  );
}
