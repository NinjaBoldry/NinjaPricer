import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { prisma } from '@/lib/db/client';
import { BundleRepository } from '@/lib/db/repositories/bundle';
import { ProductRepository } from '@/lib/db/repositories/product';
import { addBundleItem, removeBundleItem } from './actions';

const KIND_LABELS: Record<string, string> = {
  SAAS_USAGE: 'SaaS Usage',
  PACKAGED_LABOR: 'Packaged Labor',
  CUSTOM_LABOR: 'Custom Labor',
};

type BundleWithItems = Prisma.BundleGetPayload<{
  include: {
    items: {
      include: { product: true; sku: true; department: true };
      orderBy: { sortOrder: 'asc' };
    };
  };
}>;

export default async function BundleDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const [bundleRaw, products] = await Promise.all([
    new BundleRepository(prisma).findById(params.id),
    new ProductRepository(prisma).listAll(),
  ]);
  if (!bundleRaw) notFound();

  // Cast to the richer type — findById includes product/sku/department at runtime
  const bundle = bundleRaw as unknown as BundleWithItems;

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const addItem = addBundleItem.bind(null, params.id);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin" className="hover:underline">Admin</Link>
        <span>/</span>
        <Link href="/admin/bundles" className="hover:underline">Bundles</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{bundle.name}</span>
      </div>

      <h1 className="text-xl font-semibold mb-2">{bundle.name}</h1>
      {bundle.description && (
        <p className="text-sm text-muted-foreground mb-6">{bundle.description}</p>
      )}

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Bundle Items
        </h2>
        <Table className="mb-6">
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Config</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bundle.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.product.name}</TableCell>
                <TableCell>{KIND_LABELS[item.product.kind] ?? item.product.kind}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">
                  {JSON.stringify(item.config)}
                </TableCell>
                <TableCell>
                  <form action={removeBundleItem.bind(null, item.id, params.id)}>
                    <Button type="submit" variant="destructive" size="sm">Remove</Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
            {bundle.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No items yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <section className="max-w-md">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Add Item
          </h3>
          <form action={addItem} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="productId">Product</Label>
              <select id="productId" name="productId" required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                <option value="">— select —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({KIND_LABELS[p.kind] ?? p.kind})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="seatCount">Seat Count (SaaS products)</Label>
              <Input id="seatCount" name="seatCount" type="number" step="1" min="1" defaultValue="10" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="qty">Quantity (Packaged Labor)</Label>
              <Input id="qty" name="qty" type="number" step="0.5" min="0.5" defaultValue="1" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="unit">Unit (Packaged Labor)</Label>
              <select id="unit" name="unit"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                <option value="PER_DAY">Per Day</option>
                <option value="PER_USER">Per User</option>
                <option value="PER_SESSION">Per Session</option>
                <option value="FIXED">Fixed</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="hours">Hours (Custom Labor)</Label>
              <Input id="hours" name="hours" type="number" step="1" min="1" defaultValue="8" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input id="sortOrder" name="sortOrder" type="number" step="1" min="0" defaultValue="0" />
            </div>
            <Button type="submit">Add Item</Button>
          </form>
        </section>
      </section>
    </div>
  );
}
