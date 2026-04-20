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
import { CommissionRuleRepository } from '@/lib/db/repositories/commissionRule';
import { addTier, deleteTier } from './actions';

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

export default async function CommissionRuleDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const rule = await new CommissionRuleRepository(prisma).findById(params.id);
  if (!rule) notFound();

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const addTierAction = addTier.bind(null, params.id);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span>/</span>
        <Link href="/admin/commissions" className="hover:underline">
          Commission Rules
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{rule.name}</span>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-xl font-semibold">{rule.name}</h1>
        <span className="text-xs text-muted-foreground border rounded px-2 py-0.5">
          {SCOPE_LABELS[rule.scopeType]}
        </span>
        <span className="text-xs text-muted-foreground border rounded px-2 py-0.5">
          {METRIC_LABELS[rule.baseMetric]}
        </span>
      </div>

      {rule.notes && <p className="text-sm text-muted-foreground mb-6">{rule.notes}</p>}

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {rule.tiers.length === 0 && (
        <p className="text-sm text-destructive mb-4 font-medium">
          Warning: This rule has no tiers and will be skipped during commission calculation. Add a
          tier starting at threshold $0.
        </p>
      )}

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Commission Tiers
        </h2>
        <Table className="mb-6">
          <TableHeader>
            <TableRow>
              <TableHead>From (USD)</TableHead>
              <TableHead>Rate %</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rule.tiers.map((t) => (
              <TableRow key={t.id}>
                <TableCell>${Number(t.thresholdFromUsd).toLocaleString()}</TableCell>
                <TableCell>{(Number(t.ratePct) * 100).toFixed(2)}%</TableCell>
                <TableCell>
                  <form action={deleteTier.bind(null, t.id, params.id)}>
                    <Button type="submit" variant="destructive" size="sm">
                      Delete
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
            {rule.tiers.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                  No tiers yet. Add a tier starting at $0.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <section className="max-w-sm">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Add / Update Tier
          </h3>
          <form action={addTierAction} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="thresholdFromUsd">Threshold From (USD)</Label>
              <Input
                id="thresholdFromUsd"
                name="thresholdFromUsd"
                type="number"
                step="1"
                min="0"
                required
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ratePct">Rate % (e.g. 10 for 10%)</Label>
              <Input
                id="ratePct"
                name="ratePct"
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                placeholder="10"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input
                id="sortOrder"
                name="sortOrder"
                type="number"
                step="1"
                min="0"
                defaultValue="0"
              />
            </div>
            <Button type="submit">Save Tier</Button>
          </form>
        </section>
      </section>
    </div>
  );
}
