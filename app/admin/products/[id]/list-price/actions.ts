'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { ListPriceRepository } from '@/lib/db/repositories/listPrice';
import { ListPriceService } from '@/lib/services/listPrice';
import { ValidationError } from '@/lib/utils/errors';
import { parseDecimalField } from '@/lib/utils/form';

export async function upsertListPrice(productId: string, formData: FormData) {
  const service = new ListPriceService(new ListPriceRepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.upsert({
      productId,
      usdPerSeatPerMonth: parseDecimalField(
        'usdPerSeatPerMonth',
        formData.get('usdPerSeatPerMonth') as string | null,
      ),
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) {
    redirect(`/admin/products/${productId}/list-price?error=${encodeURIComponent(errorMsg)}`);
  }
  redirect(`/admin/products/${productId}/list-price`);
}
