import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { HubSpotWebhookEventRepository } from '@/lib/db/repositories/hubspotWebhookEvent';
import { RetryButton } from './RetryButton';

export const dynamic = 'force-dynamic';

export default async function WebhookEventsPage() {
  await requireAdmin();

  const events = await new HubSpotWebhookEventRepository(prisma).listRecent(200);

  return (
    <main className="p-6 space-y-4 max-w-6xl">
      <h1 className="text-2xl font-semibold">HubSpot Webhook Events</h1>
      <p className="text-sm text-muted-foreground">Most recent 200 entries, newest first.</p>

      {events.length === 0 && (
        <p className="text-muted-foreground">No webhook events recorded yet.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Received</th>
              <th className="py-2 pr-4">Subscription Type</th>
              <th className="py-2 pr-4">Object Type</th>
              <th className="py-2 pr-4">Object ID</th>
              <th className="py-2 pr-4">Processed</th>
              <th className="py-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => {
              const showRetry = ev.processedAt === null && ev.processingError !== null;
              return (
                <tr key={ev.id} className="border-b align-top">
                  <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                    {ev.receivedAt.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{ev.subscriptionType}</td>
                  <td className="py-2 pr-4 text-xs">{ev.objectType}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{ev.objectId}</td>
                  <td className="py-2 pr-4 text-xs">
                    {ev.processedAt ? (
                      <span className="text-green-700">{ev.processedAt.toLocaleString()}</span>
                    ) : (
                      <span className="text-muted-foreground">Pending</span>
                    )}
                  </td>
                  <td className="py-2">
                    {ev.processingError ? (
                      <div className="space-y-1">
                        <p className="text-xs text-red-600 break-all">{ev.processingError}</p>
                        {showRetry && <RetryButton eventId={ev.id} />}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
