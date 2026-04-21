import { prisma } from '@/lib/db/client';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';
import { HubSpotReviewResolution } from '@prisma/client';
import { ResolveButton } from './ResolveButton';

export default async function ReviewQueuePage() {
  const items = await new HubSpotReviewQueueItemRepository(prisma).listOpen();

  return (
    <main className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">HubSpot Review Queue</h1>

      {items.length === 0 && <p className="text-muted-foreground">No pending HubSpot-side edits.</p>}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Entity</th>
            <th>Changed Fields</th>
            <th>Detected</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const fields = it.changedFields as Record<string, { pricer: unknown; hubspot: unknown }>;
            return (
              <tr key={it.id} className="border-b align-top">
                <td className="py-2 pr-4">
                  <div>{it.entityType}</div>
                  <div className="text-xs text-muted-foreground">HS: {it.hubspotId}</div>
                </td>
                <td className="py-2 pr-4">
                  <ul className="space-y-1">
                    {Object.entries(fields).map(([k, v]) => (
                      <li key={k}>
                        <strong>{k}</strong>: <span className="text-muted-foreground">{String(v.pricer)}</span> →{' '}
                        <span>{String(v.hubspot)}</span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="py-2 pr-4">{it.detectedAt.toLocaleString()}</td>
                <td className="py-2 flex gap-2">
                  <ResolveButton itemId={it.id} resolution={HubSpotReviewResolution.ACCEPT_HUBSPOT} label="Accept" />
                  <ResolveButton itemId={it.id} resolution={HubSpotReviewResolution.REJECT} label="Reject" />
                  <ResolveButton itemId={it.id} resolution={HubSpotReviewResolution.IGNORE} label="Ignore" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
