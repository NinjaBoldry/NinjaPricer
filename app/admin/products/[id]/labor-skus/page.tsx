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
import { ProductRepository } from '@/lib/db/repositories/product';
import { LaborSKURepository } from '@/lib/db/repositories/laborSku';
import { upsertLaborSKU, deleteLaborSKU } from './actions';

const UNIT_LABELS: Record<string, string> = {
  PER_USER: 'Per User',
  PER_SESSION: 'Per Session',
  PER_DAY: 'Per Day',
  FIXED: 'Fixed',
};

export default async function LaborSKUsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const product = await new ProductRepository(prisma).findById(params.id);
  if (!product) notFound();

  const skus = await new LaborSKURepository(prisma).findByProduct(params.id);
  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const upsert = upsertLaborSKU.bind(null, params.id);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin/products" className="hover:underline">Products</Link>
        <span>/</span>
        <Link href={`/admin/products/${params.id}`} className="hover:underline">{product.name}</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Labor SKUs</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Labor SKUs</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <Table className="mb-8">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Cost / Unit</TableHead>
            <TableHead>Default Revenue</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {skus.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell>{UNIT_LABELS[s.unit] ?? s.unit}</TableCell>
              <TableCell>${s.costPerUnitUsd.toString()}</TableCell>
              <TableCell>${s.defaultRevenueUsd.toString()}</TableCell>
              <TableCell>
                <form action={deleteLaborSKU.bind(null, s.id, params.id)}>
                  <Button type="submit" variant="destructive" size="sm">Delete</Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
          {skus.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No Labor SKUs yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <section className="max-w-md">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Add / Update Labor SKU
        </h2>
        <form action={upsert} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="sku-name">Name</Label>
            <Input id="sku-name" name="name" required placeholder="e.g. Implementation Day" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="unit">Unit</Label>
            <select
              id="unit"
              name="unit"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="PER_DAY">Per Day</option>
              <option value="PER_USER">Per User</option>
              <option value="PER_SESSION">Per Session</option>
              <option value="FIXED">Fixed</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="costPerUnitUsd">Cost per Unit (USD)</Label>
            <Input
              id="costPerUnitUsd"
              name="costPerUnitUsd"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="800.00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="defaultRevenueUsd">Default Revenue (USD)</Label>
            <Input
              id="defaultRevenueUsd"
              name="defaultRevenueUsd"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="1200.00"
            />
          </div>
          <Button type="submit">Save Labor SKU</Button>
        </form>
      </section>
    </div>
  );
}
