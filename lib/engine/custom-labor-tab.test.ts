import { describe, it, expect } from 'vitest';
import { d } from '@/lib/utils/money';
import { computeCustomLaborTab } from './custom-labor-tab';
import type { CustomLaborTabInput, DepartmentSnap } from './types';

const departments: Record<string, DepartmentSnap> = {
  eng: {
    id: 'eng',
    name: 'Engineering',
    loadedRatePerHourUsd: d('80'),
    billRatePerHourUsd: d('200'),
  },
  train: {
    id: 'train',
    name: 'Training',
    loadedRatePerHourUsd: d('60'),
    billRatePerHourUsd: d('150'),
  },
};

const tab: CustomLaborTabInput = {
  kind: 'CUSTOM_LABOR',
  productId: 'service',
  lineItems: [
    { departmentId: 'eng', hours: d('40') },
    { departmentId: 'train', hours: d('20') },
  ],
};

describe('computeCustomLaborTab', () => {
  it('sums hours × loaded and bill rates by department', () => {
    const r = computeCustomLaborTab(tab, departments);
    expect(r.oneTimeCostCents).toBe(440000);
    expect(r.oneTimeRevenueCents).toBe(1100000);
    expect(r.contributionMarginCents).toBe(1100000 - 440000);
  });

  it('throws on unknown department', () => {
    expect(() =>
      computeCustomLaborTab(
        { ...tab, lineItems: [{ departmentId: 'nope', hours: d('1') }] },
        departments,
      ),
    ).toThrow(/unknown department/);
  });
});
