import type { ScenarioStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import ScenarioHeaderButtons from './ScenarioHeaderButtons';

interface Props {
  scenarioId: string;
  name: string;
  customerName: string;
  contractMonths: number;
  status: ScenarioStatus;
  archiveAction: (formData: FormData) => Promise<void>;
}

export default function ScenarioHeader({
  scenarioId,
  name,
  customerName,
  contractMonths,
  status,
  archiveAction,
}: Props) {
  return (
    <header className="border-b bg-white px-6 py-4 flex items-center justify-between shrink-0">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{name}</h1>
          <Badge variant="secondary">{status}</Badge>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">
          {customerName} · {contractMonths} months
        </p>
      </div>
      <ScenarioHeaderButtons
        scenarioId={scenarioId}
        status={status}
        archiveAction={archiveAction}
      />
    </header>
  );
}
