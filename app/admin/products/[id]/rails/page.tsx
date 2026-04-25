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
import { Badge } from '@/components/ui/badge';
import { prisma } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';
import { RailRepository } from '@/lib/db/repositories/rail';
import { upsertRail } from './actions';

const RAIL_KIND_LABELS: Record<string, string> = {
  MIN_MARGIN_PCT: 'Min Margin %',
  MAX_DISCOUNT_PCT: 'Max Discount %',
  MIN_SEAT_PRICE: 'Min Seat Price',
  MIN_CONTRACT_MONTHS: 'Min Contract Months',
};

const PCT_RAILS = new Set(['MIN_MARGIN_PCT', 'MAX_DISCOUNT_PCT']);

function formatThreshold(kind: string, value: { toString(): string }): string {
  const num = parseFloat(value.toString());
  if (PCT_RAILS.has(kind)) {
    return `${(num * 100).toFixed(1)}%`;
  }
  return num.toString();
}

export default async function RailsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const product = await new ProductRepository(prisma).findById(params.id);
  if (!product) notFound();

  const rails = await new RailRepository(prisma).findByProduct(params.id);

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const upsert = upsertRail.bind(null, params.id);

  // METERED products only support margin and contract-length rails; seat-price
  // and discount-percent rails are rejected by the service-layer guard added in
  // Task 6-I, so hide them from the UI as well.
  const isMetered = product.revenueModel === 'METERED';
  const allowedKinds: string[] = isMetered
    ? ['MIN_MARGIN_PCT', 'MIN_CONTRACT_MONTHS']
    : ['MIN_MARGIN_PCT', 'MAX_DISCOUNT_PCT', 'MIN_SEAT_PRICE', 'MIN_CONTRACT_MONTHS'];

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin/products" className="hover:underline">
          Products
        </Link>
        <span>/</span>
        <Link href={`/admin/products/${params.id}`} className="hover:underline">
          {product.name}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Pricing Rails</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Pricing Rails</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <Table className="mb-8">
        <TableHeader>
          <TableRow>
            <TableHead>Kind</TableHead>
            <TableHead>Basis</TableHead>
            <TableHead>Soft Threshold</TableHead>
            <TableHead>Hard Threshold</TableHead>
            <TableHead>Enabled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rails.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{RAIL_KIND_LABELS[r.kind] ?? r.kind}</TableCell>
              <TableCell>{r.marginBasis}</TableCell>
              <TableCell>{formatThreshold(r.kind, r.softThreshold)}</TableCell>
              <TableCell>{formatThreshold(r.kind, r.hardThreshold)}</TableCell>
              <TableCell>
                <Badge variant={r.isEnabled ? 'default' : 'secondary'}>
                  {r.isEnabled ? 'Yes' : 'No'}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {rails.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No rails configured yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <section className="max-w-lg">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Add / Update Rail
        </h2>
        <div className="mb-4 p-3 rounded-md bg-muted text-xs text-muted-foreground space-y-1">
          <p>
            <strong>MIN_* rails:</strong> soft threshold is the warning level; hard threshold blocks
            the deal. Soft must be &le; hard.
          </p>
          <p>
            <strong>MAX_DISCOUNT_PCT:</strong> hard threshold is stricter (lower = less discount
            allowed). Hard must be &le; soft.
          </p>
          <p>
            <strong>Percentage rails</strong> (MIN_MARGIN_PCT, MAX_DISCOUNT_PCT): enter values as
            decimals (e.g. 0.15 = 15%).
          </p>
        </div>
        <form action={upsert} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="kind">Rail Kind</Label>
            <select
              id="kind"
              name="kind"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Select kind</option>
              {allowedKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {RAIL_KIND_LABELS[kind] ?? kind}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="marginBasis">Margin Basis</Label>
            <select
              id="marginBasis"
              name="marginBasis"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="CONTRIBUTION">Contribution</option>
              <option value="NET">Net</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="softThreshold">Soft Threshold</Label>
            <Input
              id="softThreshold"
              name="softThreshold"
              type="number"
              step="0.0001"
              required
              placeholder="0.15"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hardThreshold">Hard Threshold</Label>
            <Input
              id="hardThreshold"
              name="hardThreshold"
              type="number"
              step="0.0001"
              required
              placeholder="0.10"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="isEnabled">Enabled</Label>
            <select
              id="isEnabled"
              name="isEnabled"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          <Button type="submit">Save Rail</Button>
        </form>
      </section>
    </div>
  );
}
