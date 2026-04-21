'use client';

import { useState, useTransition } from 'react';
import { pushCatalogAction, pullCatalogAction } from '../actions';

type Outcome =
  | { kind: 'push'; created: number; updated: number; unchanged: number; failed: number; correlationId: string }
  | { kind: 'pull'; newReviewItems: number; orphans: number; correlationId: string }
  | { kind: 'error'; message: string };

export function SyncButtons() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Outcome | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          className="px-4 py-2 rounded-md border bg-primary text-primary-foreground disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              try {
                const r = await pushCatalogAction();
                setResult({
                  kind: 'push',
                  correlationId: r.correlationId,
                  created: r.created.length,
                  updated: r.updated.length,
                  unchanged: r.unchanged.length,
                  failed: r.failed.length,
                });
              } catch (err) {
                setResult({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
              }
            })
          }
        >
          Push catalog to HubSpot
        </button>

        <button
          type="button"
          disabled={pending}
          className="px-4 py-2 rounded-md border disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              try {
                const r = await pullCatalogAction();
                setResult({
                  kind: 'pull',
                  correlationId: r.correlationId,
                  newReviewItems: r.reviewItems.length,
                  orphans: r.orphansInHubSpot.length,
                });
              } catch (err) {
                setResult({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
              }
            })
          }
        >
          Pull changes from HubSpot
        </button>
      </div>

      {pending && <p className="text-muted-foreground">Running…</p>}

      {result?.kind === 'push' && (
        <div className="rounded-md border p-4 bg-green-50">
          <div className="font-medium">Push complete ({result.correlationId})</div>
          <div>Created: {result.created}. Updated: {result.updated}. Unchanged: {result.unchanged}. Failed: {result.failed}.</div>
        </div>
      )}
      {result?.kind === 'pull' && (
        <div className="rounded-md border p-4 bg-blue-50">
          <div className="font-medium">Pull complete ({result.correlationId})</div>
          <div>New review items: {result.newReviewItems}. Orphans: {result.orphans}.</div>
        </div>
      )}
      {result?.kind === 'error' && (
        <div className="rounded-md border p-4 bg-red-50">
          <div className="font-medium">Failed</div>
          <div>{result.message}</div>
        </div>
      )}
    </div>
  );
}
