'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { revokeMyTokenAction } from './actions';

export default function RevokeButton({ tokenId }: { tokenId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <form
      action={async (fd) => {
        setPending(true);
        try {
          await revokeMyTokenAction(fd);
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      <input type="hidden" name="tokenId" value={tokenId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        Revoke
      </Button>
    </form>
  );
}
