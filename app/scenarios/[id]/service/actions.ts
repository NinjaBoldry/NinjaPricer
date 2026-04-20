'use server';
import { revalidatePath } from 'next/cache';
import Decimal from 'decimal.js';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { ScenarioLaborLineRepository } from '@/lib/db/repositories/scenarioLaborLine';
import { computeLoadedHourlyRate } from '@/lib/services/labor';

export async function addServiceLine(formData: FormData) {
  await requireAuth();

  const scenarioId = String(formData.get('scenarioId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const departmentId = String(formData.get('departmentId') ?? '');
  const qty = String(formData.get('qty') ?? '1');
  const revenueOverride = formData.get('revenuePerUnit');

  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    include: {
      employees: { where: { isActive: true } },
      burdens: { where: { isActive: true } },
      billRate: true,
    },
  });
  if (!dept) return;

  const burdenInputs = dept.burdens.map((b) => ({
    ratePct: new Decimal(b.ratePct.toString()),
    ...(b.capUsd != null && { capUsd: new Decimal(b.capUsd.toString()) }),
  }));

  let costPerHour = new Decimal(0);
  if (dept.employees.length > 0) {
    const rates = dept.employees.map((emp) => {
      const hours = emp.standardHoursPerYear ?? 2080;
      if (emp.compensationType === 'ANNUAL_SALARY' && emp.annualSalaryUsd != null) {
        return computeLoadedHourlyRate({
          compensationType: 'ANNUAL_SALARY',
          annualSalaryUsd: new Decimal(emp.annualSalaryUsd.toString()),
          standardHoursPerYear: hours,
          burdens: burdenInputs,
        });
      } else if (emp.compensationType === 'HOURLY' && emp.hourlyRateUsd != null) {
        return computeLoadedHourlyRate({
          compensationType: 'HOURLY',
          hourlyRateUsd: new Decimal(emp.hourlyRateUsd.toString()),
          standardHoursPerYear: hours,
          burdens: burdenInputs,
        });
      }
      return new Decimal(0);
    });
    costPerHour = rates.reduce((s, r) => s.add(r), new Decimal(0)).div(rates.length);
  }

  const revenuePerHour = revenueOverride
    ? new Decimal(String(revenueOverride))
    : dept.billRate
      ? new Decimal(dept.billRate.billRatePerHour.toString())
      : new Decimal(0);

  const repo = new ScenarioLaborLineRepository(prisma);
  await repo.create({
    scenarioId,
    productId,
    departmentId,
    customDescription: dept.name,
    qty,
    unit: 'hour',
    costPerUnitUsd: costPerHour.toFixed(4),
    revenuePerUnitUsd: revenuePerHour.toFixed(4),
  });

  revalidatePath(`/scenarios/${scenarioId}/service`);
}

export async function deleteServiceLine(id: string) {
  await requireAuth();
  await new ScenarioLaborLineRepository(prisma).deleteById(id);
}
