import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RenderArgs } from '@/lib/services/quote';
import { d } from '@/lib/utils/money';

vi.mock('./renderer', () => ({ toBuffer: vi.fn(async () => Buffer.from('PDF')) }));

import { toBuffer } from './renderer';
import { renderInternalPdf } from './internal';

const args: RenderArgs = {
  scenario: { id: 's1', name: 'N', customerName: 'Acme', contractMonths: 12 },
  generatedAt: new Date('2026-04-20T00:00:00Z'),
  version: 2,
  result: {
    perTab: [],
    totals: {
      monthlyCostCents: 100,
      monthlyRevenueCents: 1000,
      contractCostCents: 1200,
      contractRevenueCents: 12000,
      contributionMarginCents: 10800,
      netMarginCents: 10800,
      marginPctContribution: 0.9,
      marginPctNet: 0.9,
    },
    commissions: [
      {
        ruleId: 'r1',
        name: 'House',
        baseAmountCents: 12000,
        commissionAmountCents: 600,
        tierBreakdown: [],
      },
    ],
    warnings: [],
  },
};

describe('renderInternalPdf', () => {
  beforeEach(() => {
    vi.mocked(toBuffer).mockClear();
  });

  it('includes cost, margin, and commission text', async () => {
    await renderInternalPdf(args);
    const doc = vi.mocked(toBuffer).mock.calls[0]![0];
    const serialized = JSON.stringify(doc, (_k, v) => (typeof v === 'function' ? undefined : v));
    expect(serialized.toLowerCase()).toContain('contract cost');
    expect(serialized.toLowerCase()).toContain('contribution margin');
    expect(serialized.toLowerCase()).toContain('commission');
    expect(serialized).toContain('$6.00');
  });

  it('renders metered tab cost-per-unit, monthly cost, and monthly margin', async () => {
    const meteredArgs: RenderArgs = {
      scenario: { id: 's5', name: 'Metered', customerName: 'Delta', contractMonths: 12 },
      generatedAt: new Date('2026-04-20T00:00:00Z'),
      version: 3,
      result: {
        perTab: [
          {
            productId: 'metered-prod',
            kind: 'SAAS_USAGE',
            monthlyCostCents: 6000, // $60.00
            monthlyRevenueCents: 110000, // $1,100.00
            oneTimeCostCents: 0,
            oneTimeRevenueCents: 0,
            contractCostCents: 72000,
            contractRevenueCents: 1320000,
            contributionMarginCents: 1248000,
            saasMeta: {
              effectiveDiscountPct: d(0),
              metered: {
                unitLabel: 'token',
                includedUnitsPerMonth: 1000,
                committedMonthlyUsd: d('1000.00'),
                overageUnits: 200,
                overageRatePerUnitUsd: d('0.50'),
                contractDiscountPct: d(0),
                costPerUnitUsd: d('0.05'),
                committedUnitsPerMonth: 1000,
                expectedActualUnitsPerMonth: 1200,
              },
            },
          },
        ],
        totals: {
          monthlyCostCents: 6000,
          monthlyRevenueCents: 110000,
          contractCostCents: 72000,
          contractRevenueCents: 1320000,
          contributionMarginCents: 1248000,
          netMarginCents: 1248000,
          marginPctContribution: 0.945,
          marginPctNet: 0.945,
        },
        commissions: [],
        warnings: [],
      },
    };

    await renderInternalPdf(meteredArgs);
    const doc = vi.mocked(toBuffer).mock.calls[0]![0];
    const serialized = JSON.stringify(doc, (_k, v) => (typeof v === 'function' ? undefined : v));

    expect(serialized).toContain('Metered subscriptions');
    // Children arrays render per-element in JSON — assert label + variable separately
    expect(serialized).toContain('Cost per ');
    expect(serialized).toContain('token');
    expect(serialized).toContain('$0.05'); // cost per unit
    expect(serialized).toContain('Monthly cost');
    expect(serialized).toContain('$60.00'); // monthly cost
    expect(serialized).toContain('Monthly margin');
    expect(serialized).toContain('$1,040.00'); // monthly margin = 110000 - 6000 = 104000 cents
    // Margin pct: 104000/110000 ≈ 0.9454545 → 94.5%
    expect(serialized).toContain('94.5%');
  });
});
