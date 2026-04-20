'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ScenarioStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';

interface Props {
  scenarioId: string;
  status: ScenarioStatus;
  archiveAction: (formData: FormData) => Promise<void>;
}

export default function ScenarioHeaderButtons({ scenarioId, status, archiveAction }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateQuote() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/quotes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.push(`/scenarios/${scenarioId}/quotes`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quote generation failed');
    } finally {
      setPending(false);
    }
  }

  const canArchive = status !== 'ARCHIVED';

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      {canArchive && (
        <form action={archiveAction}>
          <input type="hidden" name="scenarioId" value={scenarioId} />
          <Button type="submit" variant="outline" size="sm">
            Archive
          </Button>
        </form>
      )}
      <Button
        size="sm"
        data-testid="generate-quote-btn"
        onClick={() => void handleGenerateQuote()}
        disabled={pending}
      >
        {pending ? 'Generating…' : 'Generate Quote'}
      </Button>
    </div>
  );
}
