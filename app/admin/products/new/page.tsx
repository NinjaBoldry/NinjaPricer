import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { prisma } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';
import { ProductService } from '@/lib/services/product';
import { ValidationError } from '@/lib/utils/errors';

async function createProduct(formData: FormData) {
  'use server';
  const repo = new ProductRepository(prisma);
  const service = new ProductService(repo);
  let errorMsg: string | null = null;
  let createdId: string | null = null;
  try {
    const product = await service.createProduct({
      name: formData.get('name') as string,
      kind: formData.get('kind') as string,
      description: (formData.get('description') as string) || undefined,
      sku: (formData.get('sku') as string) || undefined,
    });
    createdId = product.id;
  } catch (e) {
    if (e instanceof ValidationError) {
      errorMsg = e.message;
    } else {
      throw e;
    }
  }
  if (errorMsg) {
    redirect(`/admin/products/new?error=${encodeURIComponent(errorMsg)}`);
  }
  redirect(`/admin/products/${createdId}`);
}

export default function NewProductPage({ searchParams }: { searchParams?: { error?: string } }) {
  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;

  return (
    <div className="p-6 max-w-md">
      <h1 className="text-xl font-semibold mb-6">New Product</h1>
      {error && <p className="text-destructive text-sm mb-4">{error}</p>}
      <form action={createProduct} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required placeholder="e.g. Ninja Notes" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kind">Kind</Label>
          <select
            name="kind"
            id="kind"
            required
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="">Select kind</option>
            <option value="SAAS_USAGE">SaaS Usage</option>
            <option value="PACKAGED_LABOR">Packaged Labor</option>
            <option value="CUSTOM_LABOR">Custom Labor</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            placeholder="Short marketing description shown on customer quotes"
            rows={3}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sku">SKU</Label>
          <Input
            id="sku"
            name="sku"
            placeholder="Auto-generated from name if blank"
            style={{ textTransform: 'uppercase' }}
          />
        </div>
        <Button type="submit">Create Product</Button>
      </form>
    </div>
  );
}
