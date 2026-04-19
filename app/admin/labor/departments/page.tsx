import Link from 'next/link';
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
import { createDepartment } from './actions';

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const departments = await new DepartmentRepository(prisma).listAll();
  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin" className="hover:underline">Admin</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Departments</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Departments</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <Table className="mb-8">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Bill Rate / hr</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {departments.map((d) => (
            <TableRow key={d.id}>
              <TableCell>
                <Link
                  href={`/admin/labor/departments/${d.id}`}
                  className="font-medium hover:underline"
                >
                  {d.name}
                </Link>
              </TableCell>
              <TableCell>
                {d.billRate ? `$${d.billRate.billRatePerHour.toString()}` : '—'}
              </TableCell>
            </TableRow>
          ))}
          {departments.length === 0 && (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                No departments yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <section className="max-w-sm">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          New Department
        </h2>
        <form action={createDepartment} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="e.g. Engineering" />
          </div>
          <Button type="submit">Create Department</Button>
        </form>
      </section>
    </div>
  );
}
