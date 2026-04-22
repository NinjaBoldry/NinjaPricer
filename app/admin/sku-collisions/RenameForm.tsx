'use client';

import { useState, useTransition } from 'react';
import { setProductSkuAction, setBundleSkuAction } from './actions';

export function SetSkuForm({
  kind,
  id,
  currentSku,
}: {
  kind: 'PRODUCT' | 'BUNDLE';
  id: string;
  currentSku: string;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(currentSku);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          if (kind === 'PRODUCT') await setProductSkuAction({ id, sku: value });
          else await setBundleSkuAction({ id, sku: value });
        });
      }}
      className="inline-flex gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="text-xs px-2 py-1 border rounded disabled:opacity-50"
      >
        {pending ? '…' : 'Save SKU'}
      </button>
    </form>
  );
}
