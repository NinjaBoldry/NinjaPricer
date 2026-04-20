'use client';
import { useState, useRef } from 'react';
import PersonaMixSliders from './PersonaMixSliders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useScenarioCompute } from './ScenarioComputeContext';
import { buildEvenMix } from './personaMix';

interface Persona {
  id: string;
  name: string;
}

interface Mix {
  personaId: string;
  pct: number;
}

interface Props {
  scenarioId: string;
  productId: string;
  personas: Persona[];
  initialSeatCount: number;
  initialMix: Mix[];
  saveAction: (formData: FormData) => Promise<void>;
}

export default function NotesTabForm({
  scenarioId,
  productId,
  personas,
  initialSeatCount,
  initialMix,
  saveAction,
}: Props) {
  const { triggerCompute } = useScenarioCompute();
  const [mix, setMix] = useState<Mix[]>(
    initialMix.length > 0 ? initialMix : buildEvenMix(personas.map((p) => p.id)),
  );
  const mixInputRef = useRef<HTMLInputElement>(null);

  function handleMixChange(newMix: Mix[]) {
    setMix(newMix);
    if (mixInputRef.current) {
      mixInputRef.current.value = JSON.stringify(newMix);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await saveAction(fd);
    triggerCompute();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="scenarioId" value={scenarioId} />
      <input type="hidden" name="productId" value={productId} />
      <input ref={mixInputRef} type="hidden" name="personaMix" defaultValue={JSON.stringify(mix)} />

      <div className="space-y-1">
        <Label htmlFor="seatCount">Seat count</Label>
        <Input
          id="seatCount"
          name="seatCount"
          type="number"
          min={0}
          defaultValue={initialSeatCount}
          className="max-w-32"
        />
      </div>

      {personas.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Persona mix</Label>
          <PersonaMixSliders personas={personas} initialMix={mix} onChange={handleMixChange} />
        </div>
      )}

      <Button type="submit">Save</Button>
    </form>
  );
}
