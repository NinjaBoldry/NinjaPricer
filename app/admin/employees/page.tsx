import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { prisma } from '@/lib/db/client';
import { EmployeeRepository } from '@/lib/db/repositories/employee';
import { BurdenRepository } from '@/lib/db/repositories/burden';
import { computeLoadedHourlyRate } from '@/lib/services/labor';

export default async function EmployeesPage() {
  const [employees, allBurdens] = await Promise.all([
    new EmployeeRepository(prisma).listAllWithDepartment(),
    new BurdenRepository(prisma).findAll(),
  ]);

  const burdensFor = (departmentId: string) =>
    allBurdens
      .filter(
        (b) =>
          b.scope === 'ALL_DEPARTMENTS' ||
          (b.scope === 'DEPARTMENT' && b.departmentId === departmentId),
      )
      .map((b) => ({ ratePct: b.ratePct, capUsd: b.capUsd ?? undefined }));

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Employees</span>
      </div>

      <h1 className="text-xl font-semibold mb-2">Employees</h1>
      <p className="text-sm text-muted-foreground mb-6">
        All active employees across departments. Add or edit employees from their department.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Base</TableHead>
            <TableHead>Hrs / Year</TableHead>
            <TableHead>Loaded Rate / hr</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((emp) => {
            const burdens = burdensFor(emp.departmentId);

            const loaded =
              emp.compensationType === 'ANNUAL_SALARY' &&
              emp.annualSalaryUsd &&
              emp.standardHoursPerYear
                ? computeLoadedHourlyRate({
                    compensationType: 'ANNUAL_SALARY',
                    annualSalaryUsd: emp.annualSalaryUsd,
                    standardHoursPerYear: emp.standardHoursPerYear,
                    burdens,
                  })
                : emp.compensationType === 'HOURLY' && emp.hourlyRateUsd && emp.standardHoursPerYear
                  ? computeLoadedHourlyRate({
                      compensationType: 'HOURLY',
                      hourlyRateUsd: emp.hourlyRateUsd,
                      standardHoursPerYear: emp.standardHoursPerYear,
                      burdens,
                    })
                  : null;

            const base =
              emp.compensationType === 'ANNUAL_SALARY'
                ? emp.annualSalaryUsd
                  ? `$${emp.annualSalaryUsd.toString()} / yr`
                  : '—'
                : emp.hourlyRateUsd
                  ? `$${emp.hourlyRateUsd.toString()} / hr`
                  : '—';

            return (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">{emp.name}</TableCell>
                <TableCell>
                  <Link
                    href={`/admin/labor/departments/${emp.departmentId}`}
                    className="hover:underline"
                  >
                    {emp.department.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {emp.compensationType === 'ANNUAL_SALARY' ? 'Salary' : 'Hourly'}
                </TableCell>
                <TableCell>{base}</TableCell>
                <TableCell>{emp.standardHoursPerYear ?? '—'}</TableCell>
                <TableCell>{loaded ? `$${loaded.toFixed(2)}` : '—'}</TableCell>
              </TableRow>
            );
          })}
          {employees.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No employees yet.{' '}
                <Link href="/admin/labor/departments" className="underline">
                  Add one from a department
                </Link>
                .
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
