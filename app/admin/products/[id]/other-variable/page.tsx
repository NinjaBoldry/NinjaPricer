import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { prisma } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';
import { OtherVariableRepository } from '@/lib/db/repositories/otherVariable';
import { upsertOtherVariable } from './actions';

export default async function OtherVariablePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const product = await new ProductRepository(prisma).findById(params.id);
  if (!product) notFound();

  const current = await new OtherVariableRepository(prisma).findByProduct(params.id);

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const upsert = upsertOtherVariable.bind(null, params.id);

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
        <span className="text-foreground font-medium">Other Variable Cost</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Other Variable Cost</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {current && (
        <div className="mb-6 p-4 rounded-md border max-w-md">
          <p className="text-sm text-muted-foreground">Current value</p>
          <p className="text-lg font-semibold">
            ${parseFloat(current.usdPerUserPerMonth.toString()).toFixed(4)} / user / month
          </p>
        </div>
      )}

      <section className="max-w-md">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {current ? 'Update' : 'Set'} Other Variable Cost
        </h2>
        <form action={upsert} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="usdPerUserPerMonth">USD Per User Per Month</Label>
            <Input
              id="usdPerUserPerMonth"
              name="usdPerUserPerMonth"
              type="number"
              step="0.0001"
              min="0"
              required
              defaultValue={current ? current.usdPerUserPerMonth.toString() : ''}
              placeholder="0.00"
            />
          </div>
          <Button type="submit">Save</Button>
        </form>
      </section>
    </div>
  );
}
