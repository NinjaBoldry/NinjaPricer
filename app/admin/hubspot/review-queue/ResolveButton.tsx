'use client';

import { useTransition } from 'react';
import { HubSpotReviewResolution } from '@prisma/client';
import { resolveReviewItemAction } from '../actions';

export function ResolveButton({
  itemId,
  resolution,
  label,
}: {
  itemId: string;
  resolution: HubSpotReviewResolution;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs px-2 py-1 border rounded-md disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          await resolveReviewItemAction({ itemId, resolution });
        })
      }
    >
      {pending ? '…' : label}
    </button>
  );
}
