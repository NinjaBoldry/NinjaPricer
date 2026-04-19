import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { prisma } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';
import { ProductService } from '@/lib/services/product';
import { ValidationError } from '@/lib/utils/errors';

async function updateProduct(id: string, formData: FormData) {
  'use server';
  const service = new ProductService(new ProductRepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.updateProduct(id, {
      name: formData.get('name') as string,
      isActive: formData.get('isActive') === 'true',
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) redirect(`/admin/products/${id}?error=${encodeURIComponent(errorMsg)}`);
  redirect(`/admin/products/${id}`);
}

const SUBSECTIONS = [
  { href: 'vendor-rates', label: 'Vendor Rates' },
  { href: 'base-usage', label: 'Base Usage' },
  { href: 'other-variable', label: 'Other Variable Cost' },
  { href: 'personas', label: 'Personas' },
  { href: 'fixed-costs', label: 'Fixed Costs' },
  { href: 'scale', label: 'Active-User Scale' },
  { href: 'list-price', label: 'List Price' },
  { href: 'volume-tiers', label: 'Volume Discount Tiers' },
  { href: 'contract-modifiers', label: 'Contract Length Modifiers' },
  { href: 'rails', label: 'Pricing Rails' },
];

const KIND_LABELS: Record<string, string> = {
  SAAS_USAGE: 'SaaS Usage',
  PACKAGED_LABOR: 'Packaged Labor',
  CUSTOM_LABOR: 'Custom Labor',
};

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const repo = new ProductRepository(prisma);
  const product = await repo.findById(params.id);
  if (!product) notFound();

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const update = updateProduct.bind(null, params.id);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/products"
          className="text-sm text-muted-foreground hover:underline"
        >
          Products
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-semibold">{product.name}</h1>
        <Badge variant={product.isActive ? 'default' : 'secondary'}>
          {product.isActive ? 'Active' : 'Inactive'}
        </Badge>
        <Badge variant="outline">{KIND_LABELS[product.kind] ?? product.kind}</Badge>
      </div>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <section className="mb-8 max-w-md">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Edit Product
        </h2>
        <form action={update} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={product.name}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="isActive">Status</Label>
            <select
              name="isActive"
              id="isActive"
              defaultValue={product.isActive ? 'true' : 'false'}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          <Button type="submit" size="sm">Save Changes</Button>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Rate Card Sections
        </h2>
        <div className="grid grid-cols-2 gap-2 max-w-lg">
          {SUBSECTIONS.map(({ href, label }) => (
            <Link
              key={href}
              href={`/admin/products/${params.id}/${href}`}
              className="block rounded-md border px-4 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
