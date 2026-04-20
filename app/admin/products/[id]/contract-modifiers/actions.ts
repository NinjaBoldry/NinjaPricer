'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { ContractLengthModifierRepository } from '@/lib/db/repositories/contractLengthModifier';
import { ContractLengthModifierService } from '@/lib/services/contractLengthModifier';
import { ValidationError } from '@/lib/utils/errors';
import { parseDecimalField } from '@/lib/utils/form';

export async function upsertContractModifier(productId: string, formData: FormData) {
  const service = new ContractLengthModifierService(new ContractLengthModifierRepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.upsert({
      productId,
      minMonths: parseInt((formData.get('minMonths') as string) ?? '', 10),
      additionalDiscountPct: parseDecimalField(
        'additionalDiscountPct',
        formData.get('additionalDiscountPct') as string | null,
      ),
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) {
    redirect(
      `/admin/products/${productId}/contract-modifiers?error=${encodeURIComponent(errorMsg)}`,
    );
  }
  redirect(`/admin/products/${productId}/contract-modifiers`);
}

export async function deleteContractModifier(id: string, productId: string) {
  const service = new ContractLengthModifierService(new ContractLengthModifierRepository(prisma));
  await service.delete(id);
  redirect(`/admin/products/${productId}/contract-modifiers`);
}
