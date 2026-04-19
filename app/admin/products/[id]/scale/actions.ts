'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { ProductScaleRepository } from '@/lib/db/repositories/productScale';
import { ProductScaleService } from '@/lib/services/productScale';
import { ValidationError } from '@/lib/utils/errors';

export async function upsertProductScale(productId: string, formData: FormData) {
  const service = new ProductScaleService(new ProductScaleRepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.upsert({
      productId,
      activeUsersAtScale: parseInt(formData.get('activeUsersAtScale') as string ?? '', 10),
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) {
    redirect(
      `/admin/products/${productId}/scale?error=${encodeURIComponent(errorMsg)}`,
    );
  }
  redirect(`/admin/products/${productId}/scale`);
}
