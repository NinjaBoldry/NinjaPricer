import Decimal from 'decimal.js';
import type { EmployeeCompensationType } from '@prisma/client';

type BurdenInput = {
  ratePct: Decimal;
  capUsd?: Decimal | undefined;
};

type ComputeInput =
  | {
      compensationType: Extract<EmployeeCompensationType, 'ANNUAL_SALARY'>;
      annualSalaryUsd: Decimal;
      standardHoursPerYear: number;
      burdens: BurdenInput[];
    }
  | {
      compensationType: Extract<EmployeeCompensationType, 'HOURLY'>;
      hourlyRateUsd: Decimal;
      standardHoursPerYear: number;
      burdens: BurdenInput[];
    };

export function computeLoadedHourlyRate(input: ComputeInput): Decimal {
  const annualBase =
    input.compensationType === 'ANNUAL_SALARY'
      ? input.annualSalaryUsd
      : input.hourlyRateUsd.mul(input.standardHoursPerYear);

  const burdenCost = input.burdens.reduce((sum, burden) => {
    const uncapped = annualBase.mul(burden.ratePct);
    const cost = burden.capUsd ? Decimal.min(uncapped, burden.capUsd) : uncapped;
    return sum.add(cost);
  }, new Decimal(0));

  return annualBase.add(burdenCost).div(input.standardHoursPerYear);
}
