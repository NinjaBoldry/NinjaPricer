'use client';

import { useTransition } from 'react';
import { retryWebhookEventAction } from '../actions';

export function RetryButton({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs px-2 py-1 border rounded disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          await retryWebhookEventAction({ eventId });
        })
      }
    >
      {pending ? '…' : 'Retry'}
    </button>
  );
}
