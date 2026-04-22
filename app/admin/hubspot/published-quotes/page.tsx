import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function PublishedQuotesPage() {
  await requireAdmin();

  const quotes = await prisma.hubSpotQuote.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { scenario: { select: { id: true, name: true } } },
  });

  return (
    <main className="p-6 space-y-4 max-w-6xl">
      <h1 className="text-2xl font-semibold">Published HubSpot Quotes</h1>
      <p className="text-sm text-muted-foreground">Most recent 200 entries, newest first.</p>

      {quotes.length === 0 && <p className="text-muted-foreground">No published quotes yet.</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Scenario</th>
              <th className="py-2 pr-4">Rev</th>
              <th className="py-2 pr-4">State</th>
              <th className="py-2 pr-4">HubSpot Quote</th>
              <th className="py-2 pr-4">Last Status</th>
              <th className="py-2 pr-4">Deal Outcome</th>
              <th className="py-2 pr-4">Supersede Chain</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-b align-top">
                <td className="py-2 pr-4">
                  <div className="font-medium">{q.scenario.name}</div>
                  <div className="text-xs text-muted-foreground">{q.scenarioId}</div>
                </td>
                <td className="py-2 pr-4">{q.revision}</td>
                <td className="py-2 pr-4">
                  <span className="font-mono text-xs">{q.publishState}</span>
                </td>
                <td className="py-2 pr-4">
                  {q.shareableUrl ? (
                    <a
                      href={q.shareableUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-blue-600 font-mono text-xs"
                    >
                      {q.hubspotQuoteId}
                    </a>
                  ) : (
                    <span className="font-mono text-xs">{q.hubspotQuoteId}</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {q.lastStatus ? (
                    <>
                      <div className="text-xs font-mono">{q.lastStatus}</div>
                      <div className="text-xs text-muted-foreground">
                        {q.lastStatusAt?.toLocaleString() ?? ''}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {q.dealOutcome ? (
                    <>
                      <div className="text-xs font-mono">{q.dealOutcome}</div>
                      <div className="text-xs text-muted-foreground">
                        {q.dealOutcomeAt?.toLocaleString() ?? ''}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {q.supersedesQuoteId ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      supersedes {q.supersedesQuoteId}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 text-xs text-muted-foreground">
                  {q.createdAt.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
