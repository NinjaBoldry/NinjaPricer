import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RenderArgs } from '@/lib/services/quote';
import { d } from '@/lib/utils/money';

vi.mock('./renderer', () => ({ toBuffer: vi.fn(async () => Buffer.from('PDF')) }));

import { toBuffer } from './renderer';
import { renderCustomerPdf } from './customer';

const args: RenderArgs = {
  scenario: { id: 's1', name: 'N', customerName: 'Acme', contractMonths: 12 },
  generatedAt: new Date('2026-04-20T00:00:00Z'),
  version: 2,
  result: {
    perTab: [
      {
        productId: 'p1',
        kind: 'SAAS_USAGE',
        monthlyCostCents: 100,
        monthlyRevenueCents: 1000,
        oneTimeCostCents: 0,
        oneTimeRevenueCents: 0,
        contractCostCents: 1200,
        contractRevenueCents: 12000,
        contributionMarginCents: 10800,
      },
    ],
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
    commissions: [],
    warnings: [],
  },
};

describe('renderCustomerPdf', () => {
  beforeEach(() => {
    vi.mocked(toBuffer).mockClear();
  });

  it('returns a Buffer and does not render any cost/margin fields into the doc', async () => {
    const buf = await renderCustomerPdf(args);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(vi.mocked(toBuffer).mock.calls.length).toBe(1);

    // Shallow-inspect the React element passed to the renderer — walk the children
    // looking for any Text containing 'margin' or 'cost' (case-insensitive).
    const doc = vi.mocked(toBuffer).mock.calls[0]![0];
    const serialized = JSON.stringify(doc, (_k, v) => (typeof v === 'function' ? undefined : v));
    expect(serialized.toLowerCase()).not.toContain('margin');
    expect(serialized.toLowerCase()).not.toContain('cost');
  });

  it('renders a metered subscription detail block with all expected labels and values', async () => {
    const meteredArgs: RenderArgs = {
      scenario: { id: 's2', name: 'Metered Deal', customerName: 'Beta', contractMonths: 24 },
      generatedAt: new Date('2026-04-20T00:00:00Z'),
      version: 1,
      result: {
        perTab: [
          {
            productId: 'metered-prod',
            kind: 'SAAS_USAGE',
            monthlyCostCents: 5000,
            monthlyRevenueCents: 110000,
            oneTimeCostCents: 0,
            oneTimeRevenueCents: 0,
            contractCostCents: 120000,
            contractRevenueCents: 2640000,
            contributionMarginCents: 2520000,
            saasMeta: {
              effectiveDiscountPct: d('0.10'),
              metered: {
                unitLabel: 'token',
                includedUnitsPerMonth: 1000,
                committedMonthlyUsd: d('1000.00'),
                overageUnits: 200,
                overageRatePerUnitUsd: d('0.50'),
                contractDiscountPct: d('0.10'),
                costPerUnitUsd: d('0.05'),
                committedUnitsPerMonth: 1000,
                expectedActualUnitsPerMonth: 1200,
              },
            },
          },
        ],
        totals: {
          monthlyCostCents: 5000,
          monthlyRevenueCents: 110000,
          contractCostCents: 120000,
          contractRevenueCents: 2640000,
          contributionMarginCents: 2520000,
          netMarginCents: 2520000,
          marginPctContribution: 0.954,
          marginPctNet: 0.954,
        },
        commissions: [],
        warnings: [],
      },
    };

    await renderCustomerPdf(meteredArgs);
    const doc = vi.mocked(toBuffer).mock.calls[0]![0];
    const serialized = JSON.stringify(doc, (_k, v) => (typeof v === 'function' ? undefined : v));

    // Customer-facing words still forbidden anywhere in the doc.
    expect(serialized.toLowerCase()).not.toContain('margin');
    expect(serialized.toLowerCase()).not.toContain('cost');

    // Labels (children arrays render as separate JSON elements; assert per-piece)
    expect(serialized).toContain('-month term');
    expect(serialized).toContain('Subscription (metered-prod)');
    expect(serialized).toContain('Monthly base');
    expect(serialized).toContain('1,000');
    expect(serialized).toContain('token');
    expect(serialized).toContain('included)');
    expect(serialized).toContain('Overage rate');
    expect(serialized).toContain('Effective monthly base');
    expect(serialized).toContain('Expected monthly total');
    expect(serialized).toContain('Contract total');
    expect(serialized).toContain('Contract discount (');
    expect(serialized).toContain('-mo)');

    // Values
    expect(serialized).toContain('$1,000.00'); // committed monthly base
    expect(serialized).toContain('$0.50'); // overage rate
    expect(serialized).toContain('10.0%'); // contract discount magnitude
    expect(serialized).toContain('$900.00'); // effective monthly base after 10% discount
    expect(serialized).toContain('$1,100.00'); // expected monthly total = 110000 cents
    expect(serialized).toContain('$26,400.00'); // contract total = 2,640,000 cents
  });

  it('omits the contract-discount line when discount is zero', async () => {
    const noDiscountArgs: RenderArgs = {
      scenario: { id: 's3', name: 'No Discount', customerName: 'Gamma', contractMonths: 12 },
      generatedAt: new Date('2026-04-20T00:00:00Z'),
      version: 1,
      result: {
        perTab: [
          {
            productId: 'metered-prod',
            kind: 'SAAS_USAGE',
            monthlyCostCents: 5000,
            monthlyRevenueCents: 100000,
            oneTimeCostCents: 0,
            oneTimeRevenueCents: 0,
            contractCostCents: 60000,
            contractRevenueCents: 1200000,
            contributionMarginCents: 1140000,
            saasMeta: {
              effectiveDiscountPct: d(0),
              metered: {
                unitLabel: 'call',
                includedUnitsPerMonth: 500,
                committedMonthlyUsd: d('1000.00'),
                overageUnits: 0,
                overageRatePerUnitUsd: d('0.10'),
                contractDiscountPct: d(0),
                costPerUnitUsd: d('0.02'),
                committedUnitsPerMonth: 500,
                expectedActualUnitsPerMonth: 500,
              },
            },
          },
        ],
        totals: {
          monthlyCostCents: 5000,
          monthlyRevenueCents: 100000,
          contractCostCents: 60000,
          contractRevenueCents: 1200000,
          contributionMarginCents: 1140000,
          netMarginCents: 1140000,
          marginPctContribution: 0.95,
          marginPctNet: 0.95,
        },
        commissions: [],
        warnings: [],
      },
    };

    await renderCustomerPdf(noDiscountArgs);
    const doc = vi.mocked(toBuffer).mock.calls[0]![0];
    const serialized = JSON.stringify(doc, (_k, v) => (typeof v === 'function' ? undefined : v));
    expect(serialized).not.toContain('Contract discount');
  });
});
