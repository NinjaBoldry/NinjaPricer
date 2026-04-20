'use client';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { applyBundleAction, unapplyBundleAction } from '@/app/scenarios/[id]/actions';

interface Bundle {
  id: string;
  name: string;
}

interface Props {
  scenarioId: string;
  bundles: Bundle[];
  appliedBundleId: string | null;
  onApplied: () => void;
}

export default function BundlePicker({ scenarioId, bundles, appliedBundleId, onApplied }: Props) {
  const appliedBundle = bundles.find((b) => b.id === appliedBundleId);
  const selectRef = useRef<HTMLSelectElement>(null);

  if (bundles.length === 0) return null;

  async function handleApply(formData: FormData) {
    await applyBundleAction(formData);
    onApplied();
  }

  async function handleUnapply(formData: FormData) {
    await unapplyBundleAction(formData);
    onApplied();
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-slate-500 shrink-0">Bundle:</span>
      {appliedBundle ? (
        <>
          <span className="font-medium">{appliedBundle.name}</span>
          <form action={handleUnapply}>
            <input type="hidden" name="scenarioId" value={scenarioId} />
            <Button type="submit" variant="outline" size="sm">
              Remove
            </Button>
          </form>
        </>
      ) : (
        <form action={handleApply} className="flex items-center gap-2">
          <input type="hidden" name="scenarioId" value={scenarioId} />
          <select
            ref={selectRef}
            name="bundleId"
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            defaultValue=""
            required
          >
            <option value="" disabled>
              Select bundle…
            </option>
            {bundles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm">
            Apply
          </Button>
        </form>
      )}
    </div>
  );
}
