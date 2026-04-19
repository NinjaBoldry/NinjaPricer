'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { BaseUsageRepository } from '@/lib/db/repositories/baseUsage';
import { BaseUsageService } from '@/lib/services/baseUsage';
import { ValidationError } from '@/lib/utils/errors';
import { parseDecimalField } from '@/lib/utils/form';

export async function upsertBaseUsage(productId: string, formData: FormData) {
  const service = new BaseUsageService(new BaseUsageRepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.upsert({
      productId,
      vendorRateId: formData.get('vendorRateId') as string,
      usagePerMonth: parseDecimalField('usagePerMonth', formData.get('usagePerMonth') as string | null),
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) {
    redirect(
      `/admin/products/${productId}/base-usage?error=${encodeURIComponent(errorMsg)}`,
    );
  }
  redirect(`/admin/products/${productId}/base-usage`);
}
