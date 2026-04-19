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
import { VolumeDiscountTierRepository } from '@/lib/db/repositories/volumeDiscountTier';
import { upsertVolumeTier, deleteVolumeTier } from './actions';

export default async function VolumeTiersPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const product = await new ProductRepository(prisma).findById(params.id);
  if (!product) notFound();

  const tiers = await new VolumeDiscountTierRepository(prisma).findByProduct(params.id);

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const upsert = upsertVolumeTier.bind(null, params.id);

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
        <span className="text-foreground font-medium">Volume Discount Tiers</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Volume Discount Tiers</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <Table className="mb-8">
        <TableHeader>
          <TableRow>
            <TableHead>Min Seats</TableHead>
            <TableHead>Discount %</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tiers.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.minSeats.toLocaleString()}</TableCell>
              <TableCell>
                {(parseFloat(t.discountPct.toString()) * 100).toFixed(2)}%
              </TableCell>
              <TableCell>
                <form action={deleteVolumeTier.bind(null, t.id, params.id)}>
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
          {tiers.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={3}
                className="text-center text-muted-foreground py-8"
              >
                No volume discount tiers yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <section className="max-w-md">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Add / Update Volume Tier
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Discount is stored as a decimal (0–1). Enter 0.1 for 10%.
        </p>
        <form action={upsert} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="minSeats">Min Seats</Label>
            <Input
              id="minSeats"
              name="minSeats"
              type="number"
              step="1"
              min="1"
              required
              placeholder="10"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="discountPct">Discount (0–1)</Label>
            <Input
              id="discountPct"
              name="discountPct"
              type="number"
              step="0.0001"
              min="0"
              max="1"
              required
              placeholder="0.1"
            />
          </div>
          <Button type="submit">Save Tier</Button>
        </form>
      </section>
    </div>
  );
}
