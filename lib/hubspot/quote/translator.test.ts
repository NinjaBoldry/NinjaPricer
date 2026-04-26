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

  it('METERED tab → recurring base + overage line items', () => {
    const result = scenarioToHubSpotLineItems({
      scenarioId: 's1',
      tabs: [
        {
          kind: 'METERED_SAAS',
          productId: 'p-omni',
          productName: 'Omni Concierge',
          productSku: 'OMNI-01',
          productDescription: 'Concierge w/ usage',
          contractMonths: 36,
          unitLabel: 'interaction',
          includedUnitsPerMonth: 5000,
          committedMonthlyUsd: new Decimal(2500),
          contractDiscountPct: new Decimal('0.10'),
          overageUnits: 1200,
          overageRatePerUnitUsd: new Decimal('0.50'),
        },
      ],
      bundles: [],
    });
    expect(result).toHaveLength(2);
    // base
    const base = result[0]!;
    expect(base.properties.pricer_reason).toBe('metered_base');
    expect(base.properties.price).toBe('2250.00');
    expect(base.properties.quantity).toBe('36');
    expect(base.properties.recurringbillingfrequency).toBe('monthly');
    expect(base.properties.name).toContain('Monthly base');
    expect(base.properties.name).toContain('5000 interaction');
    expect(base.properties.pricer_original_list_price).toBe('2500.00');
    // overage
    const overage = result[1]!;
    expect(overage.properties.pricer_reason).toBe('metered_overage');
    expect(overage.properties.price).toBe('0.50');
    expect(overage.properties.quantity).toBe(String(1200 * 36));
    expect(overage.properties.recurringbillingfrequency).toBe('monthly');
    expect(overage.properties.name).toContain('Overage');
    expect(overage.properties.name).toContain('1200 interaction/mo × 36 mo');
  });

  it('METERED tab with overageUnits=0 → omits overage line item', () => {
    const result = scenarioToHubSpotLineItems({
      scenarioId: 's1',
      tabs: [
        {
          kind: 'METERED_SAAS',
          productId: 'p-omni',
          productName: 'Omni Concierge',
          productSku: 'OMNI-01',
          productDescription: '',
          contractMonths: 12,
          unitLabel: 'interaction',
          includedUnitsPerMonth: 5000,
          committedMonthlyUsd: new Decimal(2500),
          contractDiscountPct: new Decimal('0'),
          overageUnits: 0,
          overageRatePerUnitUsd: new Decimal('0.50'),
        },
      ],
      bundles: [],
    });
    expect(result).toHaveLength(1);
    const base = result[0]!;
    expect(base.properties.pricer_reason).toBe('metered_base');
    expect(base.properties.price).toBe('2500.00');
    expect(base.properties.quantity).toBe('12');
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
