'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { OtherVariableRepository } from '@/lib/db/repositories/otherVariable';
import { OtherVariableService } from '@/lib/services/otherVariable';
import { ValidationError } from '@/lib/utils/errors';
import { parseDecimalField } from '@/lib/utils/form';

export async function upsertOtherVariable(productId: string, formData: FormData) {
  const service = new OtherVariableService(new OtherVariableRepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.upsert({
      productId,
      usdPerUserPerMonth: parseDecimalField(
        'usdPerUserPerMonth',
        formData.get('usdPerUserPerMonth') as string | null,
      ),
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) {
    redirect(`/admin/products/${productId}/other-variable?error=${encodeURIComponent(errorMsg)}`);
  }
  redirect(`/admin/products/${productId}/other-variable`);
}
