import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { prisma } from '@/lib/db/client';
import { CommissionRuleRepository } from '@/lib/db/repositories/commissionRule';
import { ProductRepository } from '@/lib/db/repositories/product';
import { DepartmentRepository } from '@/lib/db/repositories/department';
import { createCommissionRule } from './actions';

const SCOPE_LABELS: Record<string, string> = {
  ALL: 'All',
  PRODUCT: 'Product',
  DEPARTMENT: 'Department',
};

const METRIC_LABELS: Record<string, string> = {
  REVENUE: 'Total Revenue',
  CONTRIBUTION_MARGIN: 'Contribution Margin',
  TAB_REVENUE: 'Tab Revenue',
  TAB_MARGIN: 'Tab Margin',
};

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const [rules, products, departments] = await Promise.all([
    new CommissionRuleRepository(prisma).findAll(),
    new ProductRepository(prisma).listAll(),
    new DepartmentRepository(prisma).listAll(),
  ]);

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin" className="hover:underline">Admin</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Commission Rules</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Commission Rules</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <Table className="mb-8">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Metric</TableHead>
            <TableHead>Tiers</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link href={`/admin/commissions/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
              </TableCell>
              <TableCell>{SCOPE_LABELS[r.scopeType] ?? r.scopeType}</TableCell>
              <TableCell>{METRIC_LABELS[r.baseMetric] ?? r.baseMetric}</TableCell>
              <TableCell>
                {r.tiers.length === 0 ? (
                  <span className="text-xs font-medium text-destructive">No tiers — will be skipped</span>
                ) : (
                  <span className="text-xs text-muted-foreground">{r.tiers.length} tier{r.tiers.length !== 1 ? 's' : ''}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
          {rules.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No commission rules yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <section className="max-w-md">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          New Commission Rule
        </h2>
        <form action={createCommissionRule} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="rule-name">Name</Label>
            <Input id="rule-name" name="name" required placeholder="e.g. Engineering Dept Commission" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="scopeType">Scope Type</Label>
            <select id="scopeType" name="scopeType"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
              <option value="ALL">All</option>
              <option value="PRODUCT">Product</option>
              <option value="DEPARTMENT">Department</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="baseMetric">Base Metric</Label>
            <select id="baseMetric" name="baseMetric"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
              <option value="REVENUE">Total Revenue</option>
              <option value="CONTRIBUTION_MARGIN">Contribution Margin</option>
              <option value="TAB_REVENUE">Tab Revenue (requires product scope)</option>
              <option value="TAB_MARGIN">Tab Margin (requires product scope)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="scopeProductId">Scoped Product (if Product scope or Tab metric)</Label>
            <select id="scopeProductId" name="scopeProductId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
              <option value="">— none —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="scopeDepartmentId">Scoped Department (if Department scope)</Label>
            <select id="scopeDepartmentId" name="scopeDepartmentId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
              <option value="">— none —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" name="notes" placeholder="Internal notes" />
          </div>
          <Button type="submit">Create Rule</Button>
        </form>
      </section>
    </div>
  );
}
