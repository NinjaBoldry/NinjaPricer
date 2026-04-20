import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import NotesTabForm from '@/components/scenarios/NotesTabForm';
import { upsertSaaSConfigAction } from './actions';

export default async function NotesTabPage({ params }: { params: { id: string } }) {
  const repo = new ScenarioRepository(prisma);
  const scenario = await repo.findById(params.id);
  if (!scenario) notFound();

  const notesProduct = await prisma.product.findFirst({
    where: { kind: 'SAAS_USAGE', isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { personas: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!notesProduct) {
    return <p className="text-sm text-slate-500">No SaaS product configured.</p>;
  }

  const saasConfig = scenario.saasConfigs.find((c) => c.productId === notesProduct.id);

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold mb-4">Notes</h2>
      <NotesTabForm
        scenarioId={params.id}
        productId={notesProduct.id}
        personas={notesProduct.personas.map((p) => ({ id: p.id, name: p.name }))}
        initialSeatCount={saasConfig?.seatCount ?? 0}
        initialMix={
          saasConfig ? (saasConfig.personaMix as { personaId: string; pct: number }[]) : []
        }
        saveAction={upsertSaaSConfigAction}
      />
    </div>
  );
}
