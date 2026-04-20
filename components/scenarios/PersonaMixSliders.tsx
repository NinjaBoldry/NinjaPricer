'use client';
import { useState } from 'react';
import { Label } from '@/components/ui/label';

interface Persona {
  id: string;
  name: string;
}

interface Mix {
  personaId: string;
  pct: number;
}

interface Props {
  personas: Persona[];
  initialMix: Mix[];
  onChange: (mix: Mix[]) => void;
}

export default function PersonaMixSliders({ personas, initialMix, onChange }: Props) {
  const seed: Mix[] = personas.map((p) => {
    const found = initialMix.find((m) => m.personaId === p.id);
    return { personaId: p.id, pct: found?.pct ?? Math.floor(100 / personas.length) };
  });

  const [mix, setMix] = useState<Mix[]>(seed);

  function handleChange(changedId: string, newPct: number) {
    const others = mix.filter((m) => m.personaId !== changedId);
    const remainingBudget = 100 - newPct;
    const otherTotal = others.reduce((s, m) => s + m.pct, 0);
    const adjusted: Mix[] = others.map((m) => ({
      ...m,
      pct:
        otherTotal === 0
          ? Math.floor(remainingBudget / others.length)
          : Math.round((m.pct / otherTotal) * remainingBudget),
    }));
    const snapTotal = adjusted.reduce((s, m) => s + m.pct, 0) + newPct;
    if (adjusted.length > 0 && snapTotal !== 100) {
      const first = adjusted[0];
      if (first) {
        adjusted[0] = { personaId: first.personaId, pct: Math.max(0, first.pct + (100 - snapTotal)) };
      }
    }
    const newMix = [
      ...adjusted,
      { personaId: changedId, pct: newPct },
    ].sort(
      (a, b) =>
        personas.findIndex((p) => p.id === a.personaId) -
        personas.findIndex((p) => p.id === b.personaId),
    );
    setMix(newMix);
    onChange(newMix);
  }

  const total = mix.reduce((s, m) => s + m.pct, 0);

  return (
    <div className="space-y-4">
      {personas.map((p) => {
        const m = mix.find((x) => x.personaId === p.id);
        const pct = m?.pct ?? 0;
        return (
          <div key={p.id} className="space-y-1">
            <div className="flex justify-between text-sm">
              <Label>{p.name}</Label>
              <span className="text-slate-500">{pct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct}
              onChange={(e) => handleChange(p.id, Number(e.target.value))}
              className="w-full accent-slate-900"
            />
          </div>
        );
      })}
      <p className={`text-xs ${total === 100 ? 'text-slate-400' : 'text-red-600 font-medium'}`}>
        Mix total: {total}%{total !== 100 ? ' — must equal 100%' : ''}
      </p>
    </div>
  );
}
