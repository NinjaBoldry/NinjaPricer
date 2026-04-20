import Decimal from 'decimal.js';
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
import { BurdenRepository } from '@/lib/db/repositories/burden';
import { DepartmentRepository } from '@/lib/db/repositories/department';
import { upsertBurden, deleteBurden } from './actions';

export default async function BurdensPage({ searchParams }: { searchParams?: { error?: string } }) {
  const [burdens, departments] = await Promise.all([
    new BurdenRepository(prisma).findAll(),
    new DepartmentRepository(prisma).listAll(),
  ]);

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Burdens</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Burdens</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <Table className="mb-8">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Rate %</TableHead>
            <TableHead>Cap (USD)</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {burdens.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">{b.name}</TableCell>
              <TableCell>{new Decimal(b.ratePct.toString()).mul(100).toFixed(2)}%</TableCell>
              <TableCell>{b.capUsd ? `$${b.capUsd.toString()}` : '—'}</TableCell>
              <TableCell>
                {b.scope === 'ALL_DEPARTMENTS' ? 'All Departments' : 'Department'}
              </TableCell>
              <TableCell>
                <form action={deleteBurden.bind(null, b.id)}>
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
          {burdens.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No burdens yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <section className="max-w-md">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Add / Update Burden
        </h2>
        <form action={upsertBurden} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="burden-name">Name</Label>
            <Input id="burden-name" name="name" required placeholder="e.g. FICA" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ratePct">Rate (decimal, e.g. 0.0765 for 7.65%)</Label>
            <Input
              id="ratePct"
              name="ratePct"
              type="number"
              step="0.0001"
              min="0"
              required
              placeholder="0.0765"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="capUsd">Cap (USD, optional)</Label>
            <Input
              id="capUsd"
              name="capUsd"
              type="number"
              step="0.01"
              min="0"
              placeholder="420.00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="scope">Scope</Label>
            <select
              id="scope"
              name="scope"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="ALL_DEPARTMENTS">All Departments</option>
              <option value="DEPARTMENT">Specific Department</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="departmentId">
              Department (required if scope is Specific Department)
            </Label>
            <select
              id="departmentId"
              name="departmentId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">— select —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">Save Burden</Button>
        </form>
      </section>
    </div>
  );
}
