'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { VendorRateRepository } from '@/lib/db/repositories/vendorRate';
import { VendorRateService } from '@/lib/services/vendorRate';
import { ValidationError } from '@/lib/utils/errors';
import { parseDecimalField } from '@/lib/utils/form';

export async function upsertVendorRate(productId: string, formData: FormData) {
  const service = new VendorRateService(new VendorRateRepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.upsert({
      productId,
      name: formData.get('name') as string,
      unitLabel: formData.get('unitLabel') as string,
      rateUsd: parseDecimalField('rateUsd', formData.get('rateUsd') as string | null),
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) {
    redirect(
      `/admin/products/${productId}/vendor-rates?error=${encodeURIComponent(errorMsg)}`,
    );
  }
  redirect(`/admin/products/${productId}/vendor-rates`);
}

export async function deleteVendorRate(id: string, productId: string) {
  const service = new VendorRateService(new VendorRateRepository(prisma));
  await service.delete(id);
  redirect(`/admin/products/${productId}/vendor-rates`);
}
