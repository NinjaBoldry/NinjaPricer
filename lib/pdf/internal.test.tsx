import { describe, it, expect, vi } from 'vitest';
import type { RenderArgs } from '@/lib/services/quote';

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
  it('includes cost, margin, and commission text', async () => {
    await renderInternalPdf(args);
    const doc = vi.mocked(toBuffer).mock.calls[0]![0];
    const serialized = JSON.stringify(doc, (_k, v) => (typeof v === 'function' ? undefined : v));
    expect(serialized.toLowerCase()).toContain('contract cost');
    expect(serialized.toLowerCase()).toContain('contribution margin');
    expect(serialized.toLowerCase()).toContain('commission');
    expect(serialized).toContain('$6.00');
  });
});
