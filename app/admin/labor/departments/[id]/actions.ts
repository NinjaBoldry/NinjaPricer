'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { DepartmentRepository } from '@/lib/db/repositories/department';
import { DepartmentService } from '@/lib/services/department';
import { EmployeeRepository } from '@/lib/db/repositories/employee';
import { EmployeeService } from '@/lib/services/employee';
import { ValidationError } from '@/lib/utils/errors';
import { parseDecimalField } from '@/lib/utils/form';

export async function setBillRate(departmentId: string, formData: FormData) {
  const service = new DepartmentService(new DepartmentRepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.setBillRate(
      departmentId,
      parseDecimalField('billRatePerHour', formData.get('billRatePerHour') as string | null),
    );
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) {
    redirect(`/admin/labor/departments/${departmentId}?error=${encodeURIComponent(errorMsg)}`);
  }
  redirect(`/admin/labor/departments/${departmentId}`);
}

export async function createEmployee(departmentId: string, formData: FormData) {
  const service = new EmployeeService(new EmployeeRepository(prisma));
  const compensationType = formData.get('compensationType') as string;
  let errorMsg: string | null = null;
  try {
    await service.create({
      name: formData.get('name') as string,
      departmentId,
      compensationType,
      annualSalaryUsd:
        compensationType === 'ANNUAL_SALARY'
          ? parseDecimalField('annualSalaryUsd', formData.get('annualSalaryUsd') as string | null)
          : undefined,
      hourlyRateUsd:
        compensationType === 'HOURLY'
          ? parseDecimalField('hourlyRateUsd', formData.get('hourlyRateUsd') as string | null)
          : undefined,
      standardHoursPerYear: (() => {
        const v = parseInt((formData.get('standardHoursPerYear') as string | null) ?? '', 10);
        return Number.isNaN(v) ? undefined : v;
      })(),
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) {
    redirect(`/admin/labor/departments/${departmentId}?error=${encodeURIComponent(errorMsg)}`);
  }
  redirect(`/admin/labor/departments/${departmentId}`);
}
