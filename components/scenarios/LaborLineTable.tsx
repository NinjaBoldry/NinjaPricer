'use client';
import type { Role } from '@prisma/client';
import Decimal from 'decimal.js';

interface LaborLine {
  id: string;
  customDescription: string | null;
  qty: unknown;
  unit: string;
  costPerUnitUsd: unknown;
  revenuePerUnitUsd: unknown;
}

export default function LaborLineTable({
  lines,
  userRole,
  deleteAction,
}: {
  lines: LaborLine[];
  userRole: Role;
  deleteAction: (id: string) => Promise<void>;
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-slate-400 mt-4">No lines added yet.</p>;
  }

  return (
    <table className="w-full text-sm mt-4">
      <thead>
        <tr className="border-b text-left text-slate-500">
          <th className="pb-2 pr-4 font-medium">Line item</th>
          <th className="pb-2 pr-4 font-medium text-right">Qty</th>
          <th className="pb-2 pr-4 font-medium">Unit</th>
          {userRole === 'ADMIN' && <th className="pb-2 pr-4 font-medium text-right">Cost/unit</th>}
          <th className="pb-2 pr-4 font-medium text-right">Rev/unit</th>
          {userRole === 'ADMIN' && <th className="pb-2 pr-4 font-medium text-right">Cost total</th>}
          <th className="pb-2 pr-4 font-medium text-right">Rev total</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const qty = new Decimal(String(l.qty));
          const rev = new Decimal(String(l.revenuePerUnitUsd));
          const cost = new Decimal(String(l.costPerUnitUsd));
          const label = l.customDescription ?? '(line item)';
          return (
            <tr key={l.id} className="border-b last:border-0">
              <td className="py-2 pr-4">{label}</td>
              <td className="py-2 pr-4 text-right">{qty.toFixed(2)}</td>
              <td className="py-2 pr-4 text-slate-500">{l.unit}</td>
              {userRole === 'ADMIN' && <td className="py-2 pr-4 text-right">${cost.toFixed(2)}</td>}
              <td className="py-2 pr-4 text-right">${rev.toFixed(2)}</td>
              {userRole === 'ADMIN' && (
                <td className="py-2 pr-4 text-right">${qty.mul(cost).toFixed(2)}</td>
              )}
              <td className="py-2 pr-4 text-right">${qty.mul(rev).toFixed(2)}</td>
              <td className="py-2">
                <form action={deleteAction.bind(null, l.id)}>
                  <button type="submit" className="text-red-500 text-xs hover:underline">
                    Remove
                  </button>
                </form>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
