import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeLoadedHourlyRate } from './labor';

// All monetary assertions use toFixed(4) to avoid floating-point noise.

describe('computeLoadedHourlyRate — ANNUAL_SALARY', () => {
  const BASE_SALARY = new Decimal('100000');
  const HOURS = 2080;

  it('returns base hourly rate when there are no burdens', () => {
    const result = computeLoadedHourlyRate({
      compensationType: 'ANNUAL_SALARY',
      annualSalaryUsd: BASE_SALARY,
      standardHoursPerYear: HOURS,
      burdens: [],
    });
    // 100000 / 2080 = 48.0769...
    expect(result.toFixed(4)).toBe('48.0769');
  });

  it('applies a flat-rate burden (no cap)', () => {
    const result = computeLoadedHourlyRate({
      compensationType: 'ANNUAL_SALARY',
      annualSalaryUsd: BASE_SALARY,
      standardHoursPerYear: HOURS,
      burdens: [{ ratePct: new Decimal('0.0765') }], // FICA 7.65%
    });
    // burden cost = 100000 * 0.0765 = 7650; total = 107650; /2080 = 51.7548...
    expect(result.toFixed(4)).toBe('51.7548');
  });

  it('applies a capped burden (FUTA: 6% up to $7000 cap)', () => {
    const result = computeLoadedHourlyRate({
      compensationType: 'ANNUAL_SALARY',
      annualSalaryUsd: BASE_SALARY,
      standardHoursPerYear: HOURS,
      burdens: [{ ratePct: new Decimal('0.06'), capUsd: new Decimal('420') }],
    });
    // uncapped = 100000 * 0.06 = 6000; cap = 420; burden cost = 420; total = 100420; /2080 = 48.2788...
    expect(result.toFixed(4)).toBe('48.2788');
  });

  it('uses uncapped amount when it is below the cap', () => {
    const result = computeLoadedHourlyRate({
      compensationType: 'ANNUAL_SALARY',
      annualSalaryUsd: BASE_SALARY,
      standardHoursPerYear: HOURS,
      burdens: [{ ratePct: new Decimal('0.01'), capUsd: new Decimal('5000') }],
    });
    // uncapped = 100000 * 0.01 = 1000; cap = 5000; burden = 1000; total = 101000; /2080 = 48.5577...
    expect(result.toFixed(4)).toBe('48.5577');
  });

  it('stacks multiple burdens correctly', () => {
    const result = computeLoadedHourlyRate({
      compensationType: 'ANNUAL_SALARY',
      annualSalaryUsd: BASE_SALARY,
      standardHoursPerYear: HOURS,
      burdens: [
        { ratePct: new Decimal('0.0765') }, // FICA: 7650
        { ratePct: new Decimal('0.06'), capUsd: new Decimal('420') }, // FUTA capped: 420
        { ratePct: new Decimal('0.02') }, // SUI: 2000
      ],
    });
    // total burden = 7650 + 420 + 2000 = 10070; total cost = 110070; /2080 = 52.9183...
    expect(result.toFixed(4)).toBe('52.9183');
  });
});

describe('computeLoadedHourlyRate — HOURLY', () => {
  const HOURLY_RATE = new Decimal('50');
  const HOURS = 2080;

  it('returns base hourly rate when there are no burdens', () => {
    const result = computeLoadedHourlyRate({
      compensationType: 'HOURLY',
      hourlyRateUsd: HOURLY_RATE,
      standardHoursPerYear: HOURS,
      burdens: [],
    });
    expect(result.toFixed(4)).toBe('50.0000');
  });

  it('applies a flat-rate burden to hourly employee', () => {
    const result = computeLoadedHourlyRate({
      compensationType: 'HOURLY',
      hourlyRateUsd: HOURLY_RATE,
      standardHoursPerYear: HOURS,
      burdens: [{ ratePct: new Decimal('0.0765') }],
    });
    // annual = 50 * 2080 = 104000; burden = 104000 * 0.0765 = 7956; total = 111956; /2080 = 53.8250
    expect(result.toFixed(4)).toBe('53.8250');
  });

  it('applies a capped burden to hourly employee', () => {
    const result = computeLoadedHourlyRate({
      compensationType: 'HOURLY',
      hourlyRateUsd: HOURLY_RATE,
      standardHoursPerYear: HOURS,
      burdens: [{ ratePct: new Decimal('0.06'), capUsd: new Decimal('420') }],
    });
    // annual = 104000; uncapped = 104000 * 0.06 = 6240; cap = 420; burden = 420; total = 104420; /2080 = 50.2019...
    expect(result.toFixed(4)).toBe('50.2019');
  });
});
