'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { ProductFixedCostRepository } from '@/lib/db/repositories/productFixedCost';
import { ProductFixedCostService } from '@/lib/services/productFixedCost';
import { ValidationError } from '@/lib/utils/errors';
import { parseDecimalField } from '@/lib/utils/form';

export async function upsertFixedCost(productId: string, formData: FormData) {
  const service = new ProductFixedCostService(new ProductFixedCostRepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.upsert({
      productId,
      name: formData.get('name') as string,
      monthlyUsd: parseDecimalField('monthlyUsd', formData.get('monthlyUsd') as string | null),
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) {
    redirect(
      `/admin/products/${productId}/fixed-costs?error=${encodeURIComponent(errorMsg)}`,
    );
  }
  redirect(`/admin/products/${productId}/fixed-costs`);
}

export async function deleteFixedCost(id: string, productId: string) {
  const service = new ProductFixedCostService(new ProductFixedCostRepository(prisma));
  await service.delete(id);
  redirect(`/admin/products/${productId}/fixed-costs`);
}
