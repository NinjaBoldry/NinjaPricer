import { describe, it, expect, vi } from 'vitest';
import type { RenderArgs } from '@/lib/services/quote';

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
  it('returns a Buffer and does not render any cost/margin fields into the doc', async () => {
    const buf = await renderCustomerPdf(args);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect((toBuffer as any).mock.calls.length).toBe(1);

    // Shallow-inspect the React element passed to the renderer — walk the children
    // looking for any Text containing 'margin' or 'cost' (case-insensitive).
    const doc = (toBuffer as any).mock.calls[0][0];
    const serialized = JSON.stringify(doc, (_k, v) => (typeof v === 'function' ? undefined : v));
    expect(serialized.toLowerCase()).not.toContain('margin');
    expect(serialized.toLowerCase()).not.toContain('cost');
  });
});
