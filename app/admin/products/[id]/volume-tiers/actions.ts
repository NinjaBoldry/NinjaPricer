'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { VolumeDiscountTierRepository } from '@/lib/db/repositories/volumeDiscountTier';
import { VolumeDiscountTierService } from '@/lib/services/volumeDiscountTier';
import { ValidationError } from '@/lib/utils/errors';
import { parseDecimalField } from '@/lib/utils/form';

export async function upsertVolumeTier(productId: string, formData: FormData) {
  const service = new VolumeDiscountTierService(new VolumeDiscountTierRepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.upsert({
      productId,
      minSeats: parseInt((formData.get('minSeats') as string) ?? '', 10),
      discountPct: parseDecimalField('discountPct', formData.get('discountPct') as string | null),
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) {
    redirect(`/admin/products/${productId}/volume-tiers?error=${encodeURIComponent(errorMsg)}`);
  }
  redirect(`/admin/products/${productId}/volume-tiers`);
}

export async function deleteVolumeTier(id: string, productId: string) {
  const service = new VolumeDiscountTierService(new VolumeDiscountTierRepository(prisma));
  await service.delete(id);
  redirect(`/admin/products/${productId}/volume-tiers`);
}
