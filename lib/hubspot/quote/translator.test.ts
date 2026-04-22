import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { scenarioToHubSpotLineItems } from './translator';

describe('scenarioToHubSpotLineItems', () => {
  it('SaaS line with negotiated discount → list + discount (pricer_reason: negotiated)', () => {
    const result = scenarioToHubSpotLineItems({
      scenarioId: 's1',
      tabs: [
        {
          kind: 'SAAS',
          productId: 'p1',
          productName: 'Ninja Notes',
          productSku: 'NN-01',
          productDescription: 'Note capture',
          seatCount: 10,
          listPriceMonthly: new Decimal(100),
          effectiveUnitPriceMonthly: new Decimal(80),
          discountPct: new Decimal(0.2),
          contractMonths: 12,
          rampSchedule: null,
        },
      ],
      bundles: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].properties.pricer_reason).toBe('negotiated');
    expect(result[0].properties.price).toBe('100.00');
    expect(result[0].properties.hs_discount_percentage).toBe('20');
    expect(result[0].properties.pricer_scenario_id).toBe('s1');
  });

  it('bundle line → override unit price (pricer_reason: bundle_rollup)', () => {
    const result = scenarioToHubSpotLineItems({
      scenarioId: 's1',
      tabs: [],
      bundles: [
        {
          bundleId: 'b1',
          bundleName: 'Growth Bundle',
          bundleSku: 'B-GROW',
          bundleDescription: 'Scale-up package',
          rolledUpMonthlyPrice: new Decimal(900),
          itemListPriceSum: new Decimal(1100),
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].properties.pricer_reason).toBe('bundle_rollup');
    expect(result[0].properties.price).toBe('900.00');
    expect(result[0].properties.pricer_original_list_price).toBe('1100.00');
  });

  it('ramp pricing → override + pricer_ramp_schedule JSON', () => {
    const ramp = [
      { monthStart: 1, monthEnd: 3, pricePerSeat: 50 },
      { monthStart: 4, monthEnd: 12, pricePerSeat: 100 },
    ];
    const result = scenarioToHubSpotLineItems({
      scenarioId: 's1',
      tabs: [
        {
          kind: 'SAAS',
          productId: 'p1',
          productName: 'Ninja Notes',
          productSku: 'NN-01',
          productDescription: '',
          seatCount: 10,
          listPriceMonthly: new Decimal(100),
          effectiveUnitPriceMonthly: new Decimal(50),
          discountPct: null,
          contractMonths: 12,
          rampSchedule: ramp,
        },
      ],
      bundles: [],
    });
    expect(result[0].properties.pricer_reason).toBe('ramp');
    expect(result[0].properties.price).toBe('50.00');
    expect(JSON.parse(result[0].properties.pricer_ramp_schedule as string)).toEqual(ramp);
  });

  it('labor line → pricer_reason: other', () => {
    const result = scenarioToHubSpotLineItems({
      scenarioId: 's1',
      tabs: [
        {
          kind: 'LABOR',
          skuId: 'labor-1',
          skuName: 'White-Glove Onboarding',
          skuCode: 'WG-ONBOARD',
          skuDescription: 'Setup + training',
          qty: 1,
          unitPrice: new Decimal(5000),
        },
      ],
      bundles: [],
    });
    expect(result[0].properties.pricer_reason).toBe('other');
    expect(result[0].properties.price).toBe('5000.00');
  });
});
