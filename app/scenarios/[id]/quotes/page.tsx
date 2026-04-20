import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { QuoteRepository } from '@/lib/db/repositories/quote';

export const dynamic = 'force-dynamic';

export default async function QuotesHistoryPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireAuth();
  const scenario = await prisma.scenario.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, customerName: true, ownerId: true },
  });
  if (!scenario) notFound();
  if (user.role === 'SALES' && scenario.ownerId !== user.id) notFound();

  const repo = new QuoteRepository(prisma);
  const quotes = await repo.listByScenario(params.id);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Quote history</h1>
        <p className="text-sm text-muted-foreground">
          {scenario.name} · {scenario.customerName}
        </p>
      </div>

      {quotes.length === 0 ? (
        <p className="text-sm">No quotes generated yet. Use the Generate Quote button in the builder.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left border-b">
            <tr>
              <th className="py-2">Version</th>
              <th>Generated</th>
              <th>By</th>
              <th>Contract total</th>
              <th>Downloads</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => {
              const totals = q.totals as { contractRevenueCents?: number };
              return (
                <tr key={q.id} className="border-b">
                  <td className="py-2">v{q.version}</td>
                  <td>{q.generatedAt.toISOString().slice(0, 10)}</td>
                  <td>{q.generatedBy?.name ?? q.generatedBy?.email ?? '—'}</td>
                  <td>
                    {typeof totals?.contractRevenueCents === 'number'
                      ? `$${(totals.contractRevenueCents / 100).toFixed(2)}`
                      : '—'}
                  </td>
                  <td className="space-x-3">
                    <Link
                      className="underline"
                      href={`/api/quotes/${q.id}/download`}
                      prefetch={false}
                    >
                      Customer PDF
                    </Link>
                    {user.role === 'ADMIN' && (
                      <Link
                        className="underline"
                        href={`/api/quotes/${q.id}/download?variant=internal`}
                        prefetch={false}
                      >
                        Internal summary
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
