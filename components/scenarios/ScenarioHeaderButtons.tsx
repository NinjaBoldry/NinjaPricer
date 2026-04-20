'use client';
import type { ScenarioStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';

interface Props {
  scenarioId: string;
  status: ScenarioStatus;
  archiveAction: (formData: FormData) => Promise<void>;
}

export default function ScenarioHeaderButtons({ scenarioId, status, archiveAction }: Props) {
  async function handleGenerateQuote() {
    await fetch('/api/quotes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId }),
    });
    alert('Quote generation is not yet implemented.');
  }

  const canArchive = status !== 'ARCHIVED';

  return (
    <div className="flex items-center gap-2">
      {canArchive && (
        <form action={archiveAction}>
          <input type="hidden" name="scenarioId" value={scenarioId} />
          <Button type="submit" variant="outline" size="sm">
            Archive
          </Button>
        </form>
      )}
      <Button size="sm" data-testid="generate-quote-btn" onClick={() => void handleGenerateQuote()}>
        Generate Quote
      </Button>
    </div>
  );
}
