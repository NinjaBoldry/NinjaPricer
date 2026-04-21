import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { HubSpotConfigRepository } from '@/lib/db/repositories/hubspotConfig';
import { HubSpotProductMapRepository } from '@/lib/db/repositories/hubspotProductMap';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';

export const dynamic = 'force-dynamic';

export default async function HubSpotStatusPage() {
  await requireAdmin();

  const config = await new HubSpotConfigRepository(prisma).findCurrent();
  const mappings = await new HubSpotProductMapRepository(prisma).listAll();
  const openReview = await new HubSpotReviewQueueItemRepository(prisma).listOpen();

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">HubSpot Integration</h1>

      <section className="grid grid-cols-2 gap-4">
        <Stat label="Enabled" value={config?.enabled ? 'Yes' : 'No'} />
        <Stat label="Portal ID" value={config?.portalId ?? '—'} />
        <Stat label="Last Push" value={config?.lastPushAt?.toLocaleString() ?? 'Never'} />
        <Stat label="Last Pull" value={config?.lastPullAt?.toLocaleString() ?? 'Never'} />
        <Stat label="Mappings" value={String(mappings.length)} />
        <Stat label="Open Review Items" value={String(openReview.length)} />
      </section>

      <nav className="flex gap-3">
        <Link href="/admin/hubspot/sync" className="underline">
          Sync catalog →
        </Link>
        <Link href="/admin/hubspot/review-queue" className="underline">
          Review queue →
        </Link>
      </nav>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-md p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-lg font-medium">{value}</div>
    </div>
  );
}
