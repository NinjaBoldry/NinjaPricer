import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { prisma } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';
import { ListPriceRepository } from '@/lib/db/repositories/listPrice';
import { upsertListPrice } from './actions';

export default async function ListPricePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const product = await new ProductRepository(prisma).findById(params.id);
  if (!product) notFound();

  const current = await new ListPriceRepository(prisma).findByProduct(params.id);

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const upsert = upsertListPrice.bind(null, params.id);

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
        <span className="text-foreground font-medium">List Price</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">List Price</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {current && (
        <div className="mb-6 p-4 rounded-md border max-w-md">
          <p className="text-sm text-muted-foreground">Current value</p>
          <p className="text-lg font-semibold">
            ${parseFloat(current.usdPerSeatPerMonth.toString()).toFixed(2)} / seat / month
          </p>
        </div>
      )}

      <section className="max-w-md">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {current ? 'Update' : 'Set'} List Price
        </h2>
        <form action={upsert} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="usdPerSeatPerMonth">USD Per Seat Per Month</Label>
            <Input
              id="usdPerSeatPerMonth"
              name="usdPerSeatPerMonth"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={current ? current.usdPerSeatPerMonth.toString() : ''}
              placeholder="49.00"
            />
          </div>
          <Button type="submit">Save</Button>
        </form>
      </section>
    </div>
  );
}
