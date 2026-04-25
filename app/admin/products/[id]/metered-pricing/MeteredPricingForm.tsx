'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setMeteredPricingAction } from './actions';

export interface MeteredPricingInitial {
  unitLabel: string;
  includedUnitsPerMonth: number;
  committedMonthlyUsd: string | number;
  overageRatePerUnitUsd: string | number;
  costPerUnitUsd: string | number;
}

export function MeteredPricingForm({
  productId,
  initial,
}: {
  productId: string;
  initial: MeteredPricingInitial | null;
}) {
  const [unitLabel, setUnitLabel] = useState<string>(initial?.unitLabel ?? 'minute');
  const [includedUnitsPerMonth, setIncludedUnitsPerMonth] = useState<number>(
    initial?.includedUnitsPerMonth ?? 0,
  );
  const [committedMonthlyUsd, setCommittedMonthlyUsd] = useState<number>(
    Number(initial?.committedMonthlyUsd ?? 0),
  );
  const [overageRatePerUnitUsd, setOverageRatePerUnitUsd] = useState<number>(
    Number(initial?.overageRatePerUnitUsd ?? 0),
  );
  const [costPerUnitUsd, setCostPerUnitUsd] = useState<number>(
    Number(initial?.costPerUnitUsd ?? 0),
  );

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={() => {
        setError(null);
        setSuccess(false);
        startTransition(async () => {
          const result = await setMeteredPricingAction(productId, {
            unitLabel,
            includedUnitsPerMonth,
            committedMonthlyUsd,
            overageRatePerUnitUsd,
            costPerUnitUsd,
          });
          if (!result.ok) setError(result.error);
          else setSuccess(true);
        });
      }}
      className="space-y-4 max-w-md"
    >
      {error && <p className="text-destructive text-sm">{error}</p>}
      {success && <p className="text-sm text-muted-foreground">Saved.</p>}

      <div className="space-y-1">
        <Label htmlFor="unitLabel">Unit Label</Label>
        <Input
          id="unitLabel"
          name="unitLabel"
          required
          value={unitLabel}
          onChange={(e) => setUnitLabel(e.target.value)}
          placeholder="minute"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="includedUnitsPerMonth">Included Units / Month</Label>
        <Input
          id="includedUnitsPerMonth"
          name="includedUnitsPerMonth"
          type="number"
          step="1"
          min="0"
          required
          value={includedUnitsPerMonth}
          onChange={(e) => setIncludedUnitsPerMonth(Number.parseInt(e.target.value, 10) || 0)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="committedMonthlyUsd">Committed Monthly USD</Label>
        <Input
          id="committedMonthlyUsd"
          name="committedMonthlyUsd"
          type="number"
          step="0.01"
          min="0"
          required
          value={committedMonthlyUsd}
          onChange={(e) => setCommittedMonthlyUsd(Number.parseFloat(e.target.value) || 0)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="overageRatePerUnitUsd">Overage Rate / Unit (USD)</Label>
        <Input
          id="overageRatePerUnitUsd"
          name="overageRatePerUnitUsd"
          type="number"
          step="0.000001"
          min="0"
          required
          value={overageRatePerUnitUsd}
          onChange={(e) => setOverageRatePerUnitUsd(Number.parseFloat(e.target.value) || 0)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="costPerUnitUsd">Cost / Unit (USD)</Label>
        <Input
          id="costPerUnitUsd"
          name="costPerUnitUsd"
          type="number"
          step="0.000001"
          min="0"
          required
          value={costPerUnitUsd}
          onChange={(e) => setCostPerUnitUsd(Number.parseFloat(e.target.value) || 0)}
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
