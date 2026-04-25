import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';
import { ProductService } from '@/lib/services/product';
import { ValidationError } from '@/lib/utils/errors';
import { NewProductForm } from './NewProductForm';

async function createProduct(formData: FormData) {
  'use server';
  const repo = new ProductRepository(prisma);
  const service = new ProductService(repo);
  let errorMsg: string | null = null;
  let createdId: string | null = null;
  try {
    const revenueModelRaw = formData.get('revenueModel');
    const product = await service.createProduct({
      name: formData.get('name') as string,
      kind: formData.get('kind') as string,
      description: (formData.get('description') as string) || undefined,
      sku: (formData.get('sku') as string) || undefined,
      revenueModel: revenueModelRaw ? (revenueModelRaw as string) : undefined,
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
      <NewProductForm action={createProduct} />
    </div>
  );
}
