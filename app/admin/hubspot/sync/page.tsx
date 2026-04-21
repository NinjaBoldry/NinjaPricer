import { SyncButtons } from './SyncButtons';

export default function SyncPage() {
  return (
    <main className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">HubSpot Catalog Sync</h1>
      <p className="text-muted-foreground">
        Manual sync only. Push writes active pricer products and bundles to HubSpot. Pull detects HubSpot-side edits
        to pricer-managed products and enqueues them in the review queue.
      </p>
      <SyncButtons />
    </main>
  );
}
