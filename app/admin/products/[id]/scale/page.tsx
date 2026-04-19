import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { prisma } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';
import { ProductScaleRepository } from '@/lib/db/repositories/productScale';
import { upsertProductScale } from './actions';

export default async function ScalePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const product = await new ProductRepository(prisma).findById(params.id);
  if (!product) notFound();

  const current = await new ProductScaleRepository(prisma).findByProduct(params.id);

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const upsert = upsertProductScale.bind(null, params.id);

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
        <span className="text-foreground font-medium">Active-User Scale</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Active-User Scale</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {current && (
        <div className="mb-6 p-4 rounded-md border max-w-md">
          <p className="text-sm text-muted-foreground">Current value</p>
          <p className="text-lg font-semibold">
            {current.activeUsersAtScale.toLocaleString()} active users at scale
          </p>
        </div>
      )}

      <section className="max-w-md">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {current ? 'Update' : 'Set'} Active-User Scale
        </h2>
        <form action={upsert} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="activeUsersAtScale">Active Users at Scale</Label>
            <Input
              id="activeUsersAtScale"
              name="activeUsersAtScale"
              type="number"
              step="1"
              min="1"
              required
              defaultValue={current ? current.activeUsersAtScale.toString() : ''}
              placeholder="1000"
            />
          </div>
          <Button type="submit">Save</Button>
        </form>
      </section>
    </div>
  );
}
