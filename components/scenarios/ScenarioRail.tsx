'use client';
import type { Role } from '@prisma/client';
import type { ComputeResult } from '@/lib/engine/types';

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

interface Props {
  userRole: Role;
  computeResult: ComputeResult | null;
}

export default function ScenarioRail({ computeResult, userRole }: Props) {
  const t = computeResult?.totals;
  const totalCommission = computeResult?.commissions.reduce(
    (s, c) => s + c.commissionAmountCents,
    0,
  );

  return (
    <aside
      className="w-72 shrink-0 border-r bg-slate-50 p-5 sticky top-0 h-screen overflow-auto"
      aria-label="Deal summary"
    >
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
        Deal Summary
      </p>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Contract revenue</dt>
          <dd className="font-medium" data-testid="rail-contract-revenue">
            {t ? formatCents(t.contractRevenueCents) : '—'}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Contribution margin</dt>
          <dd className="font-medium">{t ? formatCents(t.contributionMarginCents) : '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Commissions</dt>
          <dd className="font-medium">
            {totalCommission != null ? formatCents(totalCommission) : '—'}
          </dd>
        </div>
        <div className="flex justify-between border-t pt-3">
          <dt className="font-medium">Net margin</dt>
          <dd className="font-semibold" data-testid="rail-net-margin">
            {t ? `${formatCents(t.netMarginCents)} (${(t.marginPctNet * 100).toFixed(1)}%)` : '—'}
          </dd>
        </div>
      </dl>

      {computeResult?.warnings.map((w) => (
        <div
          key={w.railId}
          className={`mt-3 rounded p-2 text-xs leading-snug ${
            w.severity === 'hard' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {userRole === 'SALES'
            ? w.severity === 'hard'
              ? 'This deal is below an approved floor — admin review required before quoting.'
              : 'This deal is approaching an approved floor — consider adjusting.'
            : w.message}
        </div>
      ))}
    </aside>
  );
}
