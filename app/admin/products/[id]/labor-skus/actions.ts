'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { LaborSKURepository } from '@/lib/db/repositories/laborSku';
import { LaborSKUService } from '@/lib/services/laborSku';
import { ValidationError } from '@/lib/utils/errors';
import { parseDecimalField } from '@/lib/utils/form';

export async function upsertLaborSKU(productId: string, formData: FormData) {
  const service = new LaborSKUService(new LaborSKURepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.upsert({
      productId,
      name: formData.get('name') as string,
      unit: formData.get('unit') as string,
      costPerUnitUsd: parseDecimalField('costPerUnitUsd', formData.get('costPerUnitUsd') as string | null),
      defaultRevenueUsd: parseDecimalField('defaultRevenueUsd', formData.get('defaultRevenueUsd') as string | null),
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) {
    redirect(`/admin/products/${productId}/labor-skus?error=${encodeURIComponent(errorMsg)}`);
  }
  redirect(`/admin/products/${productId}/labor-skus`);
}

export async function deleteLaborSKU(id: string, productId: string) {
  const service = new LaborSKUService(new LaborSKURepository(prisma));
  await service.delete(id);
  redirect(`/admin/products/${productId}/labor-skus`);
}
