'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useScenarioCompute } from './ScenarioComputeContext';
import { formatCents, formatPct } from '@/lib/pdf/format';

interface PricingProps {
  unitLabel: string;
  includedUnitsPerMonth: number;
  committedMonthlyUsd: string;
  overageRatePerUnitUsd: string;
}

interface Props {
  scenarioId: string;
  productId: string;
  contractMonths: number;
  pricing: PricingProps;
  initialCommittedUnitsPerMonth: number;
  initialExpectedActualUnitsPerMonth: number;
  saveAction: (formData: FormData) => Promise<void>;
}

function formatUsd(usd: string | number): string {
  const num = typeof usd === 'string' ? Number(usd) : usd;
  if (!Number.isFinite(num)) return '—';
  return formatCents(Math.round(num * 100));
}

export default function MeteredTabForm({
  scenarioId,
  productId,
  contractMonths,
  pricing,
  initialCommittedUnitsPerMonth,
  initialExpectedActualUnitsPerMonth,
  saveAction,
}: Props) {
  const { computeResult, triggerCompute } = useScenarioCompute();
  const [committed, setCommitted] = useState<number>(initialCommittedUnitsPerMonth);
  const [expected, setExpected] = useState<number>(initialExpectedActualUnitsPerMonth);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced live recompute on input changes — matches Notes tab behavior
  // of refreshing the compute context after user input.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      triggerCompute();
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // We deliberately recompute when committed/expected change.
  }, [committed, expected, triggerCompute]);

  // Pull this product's metered tab result from the compute response.
  const tab = computeResult?.perTab.find(
    (t) => t.productId === productId && t.kind === 'SAAS_USAGE',
  );
  const meta = tab?.saasMeta?.metered;

  const summary = useMemo(() => {
    if (!tab || !meta) return null;
    const committedMonthlyAfterDiscountUsd =
      Number(meta.committedMonthlyUsd) * (1 - Number(meta.contractDiscountPct));
    const overageRevenueUsd =
      Number(meta.overageRatePerUnitUsd) * meta.overageUnits;
    const monthlyRevenueCents = tab.monthlyRevenueCents;
    const monthlyCostCents = tab.monthlyCostCents;
    const monthlyMarginCents = monthlyRevenueCents - monthlyCostCents;
    const monthlyMarginPct =
      monthlyRevenueCents > 0 ? monthlyMarginCents / monthlyRevenueCents : 0;
    return {
      committedMonthlyAfterDiscountCents: Math.round(committedMonthlyAfterDiscountUsd * 100),
      overageUnits: meta.overageUnits,
      overageRevenueCents: Math.round(overageRevenueUsd * 100),
      monthlyRevenueCents,
      monthlyCostCents,
      monthlyMarginCents,
      monthlyMarginPct,
      contractRevenueCents: tab.contractRevenueCents,
    };
  }, [tab, meta]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await saveAction(fd);
    triggerCompute();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name="scenarioId" value={scenarioId} />
        <input type="hidden" name="productId" value={productId} />

        <div className="space-y-1">
          <Label htmlFor="committedUnitsPerMonth">
            Committed {pricing.unitLabel} / month
          </Label>
          <Input
            id="committedUnitsPerMonth"
            name="committedUnitsPerMonth"
            type="number"
            min={0}
            step={1}
            value={committed}
            onChange={(e) => setCommitted(Number(e.target.value))}
            className="max-w-40"
          />
          <p className="text-xs text-slate-500">
            Included in plan: {pricing.includedUnitsPerMonth.toLocaleString()} {pricing.unitLabel}
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="expectedActualUnitsPerMonth">
            Expected actual {pricing.unitLabel} / month
          </Label>
          <Input
            id="expectedActualUnitsPerMonth"
            name="expectedActualUnitsPerMonth"
            type="number"
            min={0}
            step={1}
            value={expected}
            onChange={(e) => setExpected(Number(e.target.value))}
            className="max-w-40"
          />
          <p className="text-xs text-slate-500">
            Drives overage charges (above {pricing.includedUnitsPerMonth.toLocaleString()}{' '}
            {pricing.unitLabel}) and usage cost.
          </p>
        </div>

        <div className="space-y-1">
          <Label>Contract months</Label>
          <p className="text-sm text-slate-700">{contractMonths}</p>
          <p className="text-xs text-slate-500">Edit on the scenario header.</p>
        </div>

        <Button type="submit">Save</Button>
      </form>

      <section
        aria-label="Metered tab summary"
        className="rounded border border-slate-200 bg-slate-50 p-4"
      >
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Live summary</h3>
        {summary ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Committed monthly</dt>
            <dd className="font-medium text-right">
              {formatCents(summary.committedMonthlyAfterDiscountCents)}
            </dd>

            <dt className="text-slate-500">Overage</dt>
            <dd className="font-medium text-right">
              {summary.overageUnits.toLocaleString()} &times;{' '}
              {formatUsd(pricing.overageRatePerUnitUsd)} ={' '}
              {formatCents(summary.overageRevenueCents)}
            </dd>

            <dt className="text-slate-500">Total monthly revenue</dt>
            <dd className="font-medium text-right">
              {formatCents(summary.monthlyRevenueCents)}
            </dd>

            <dt className="text-slate-500">Monthly cost</dt>
            <dd className="font-medium text-right">{formatCents(summary.monthlyCostCents)}</dd>

            <dt className="text-slate-500">Monthly margin</dt>
            <dd className="font-medium text-right">
              {formatCents(summary.monthlyMarginCents)} ({formatPct(summary.monthlyMarginPct)})
            </dd>

            <dt className="text-slate-500 border-t pt-2">Contract total (revenue)</dt>
            <dd className="font-semibold text-right border-t pt-2">
              {formatCents(summary.contractRevenueCents)}
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">
            Save the form to populate the live summary, or wait for the compute to refresh.
          </p>
        )}
      </section>
    </div>
  );
}
