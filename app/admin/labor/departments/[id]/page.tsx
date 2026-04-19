import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { prisma } from '@/lib/db/client';
import { DepartmentRepository } from '@/lib/db/repositories/department';
import { EmployeeRepository } from '@/lib/db/repositories/employee';
import { BurdenRepository } from '@/lib/db/repositories/burden';
import { computeLoadedHourlyRate } from '@/lib/services/labor';
import { setBillRate, createEmployee } from './actions';

export default async function DepartmentDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const department = await new DepartmentRepository(prisma).findById(params.id);
  if (!department) notFound();

  const [employees, burdens] = await Promise.all([
    new EmployeeRepository(prisma).findByDepartment(params.id),
    new BurdenRepository(prisma).findByDepartment(params.id),
  ]);

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const setBillRateAction = setBillRate.bind(null, params.id);
  const createEmployeeAction = createEmployee.bind(null, params.id);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin" className="hover:underline">Admin</Link>
        <span>/</span>
        <Link href="/admin/labor/departments" className="hover:underline">Departments</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{department.name}</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">{department.name}</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <section className="mb-8 max-w-sm">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Bill Rate
        </h2>
        <form action={setBillRateAction} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="billRatePerHour">Bill Rate per Hour (USD)</Label>
            <Input
              id="billRatePerHour"
              name="billRatePerHour"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={department.billRate?.billRatePerHour.toString() ?? ''}
              placeholder="150.00"
            />
          </div>
          <Button type="submit" size="sm">Save Bill Rate</Button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Employees
        </h2>
        <Table className="mb-6">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Base</TableHead>
              <TableHead>Hrs / Year</TableHead>
              <TableHead>Loaded Rate / hr</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((emp) => {
              const loaded =
                emp.compensationType === 'ANNUAL_SALARY' && emp.annualSalaryUsd && emp.standardHoursPerYear
                  ? computeLoadedHourlyRate({
                      compensationType: 'ANNUAL_SALARY',
                      annualSalaryUsd: emp.annualSalaryUsd,
                      standardHoursPerYear: emp.standardHoursPerYear,
                      burdens: burdens.map((b) => ({
                        ratePct: b.ratePct,
                        capUsd: b.capUsd ?? undefined,
                      })),
                    })
                  : emp.compensationType === 'HOURLY' && emp.hourlyRateUsd && emp.standardHoursPerYear
                  ? computeLoadedHourlyRate({
                      compensationType: 'HOURLY',
                      hourlyRateUsd: emp.hourlyRateUsd,
                      standardHoursPerYear: emp.standardHoursPerYear,
                      burdens: burdens.map((b) => ({
                        ratePct: b.ratePct,
                        capUsd: b.capUsd ?? undefined,
                      })),
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
                  <TableCell>{emp.compensationType === 'ANNUAL_SALARY' ? 'Salary' : 'Hourly'}</TableCell>
                  <TableCell>{base}</TableCell>
                  <TableCell>{emp.standardHoursPerYear ?? '—'}</TableCell>
                  <TableCell>{loaded ? `$${loaded.toFixed(2)}` : '—'}</TableCell>
                </TableRow>
              );
            })}
            {employees.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No employees yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <section className="max-w-md">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Add Employee
          </h3>
          <form action={createEmployeeAction} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="emp-name">Name</Label>
              <Input id="emp-name" name="name" required placeholder="e.g. Jane Smith" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="compensationType">Compensation Type</Label>
              <select
                id="compensationType"
                name="compensationType"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="ANNUAL_SALARY">Annual Salary</option>
                <option value="HOURLY">Hourly</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="annualSalaryUsd">Annual Salary (USD) — for salaried</Label>
              <Input
                id="annualSalaryUsd"
                name="annualSalaryUsd"
                type="number"
                step="1"
                min="1"
                placeholder="120000"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hourlyRateUsd">Hourly Rate (USD) — for hourly</Label>
              <Input
                id="hourlyRateUsd"
                name="hourlyRateUsd"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="55.00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="standardHoursPerYear">Standard Hours per Year</Label>
              <Input
                id="standardHoursPerYear"
                name="standardHoursPerYear"
                type="number"
                step="1"
                min="1"
                required
                defaultValue="2080"
              />
            </div>
            <Button type="submit">Add Employee</Button>
          </form>
        </section>
      </section>
    </div>
  );
}
