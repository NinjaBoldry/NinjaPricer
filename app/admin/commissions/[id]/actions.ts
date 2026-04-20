'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { CommissionTierRepository } from '@/lib/db/repositories/commissionTier';
import { CommissionTierService } from '@/lib/services/commissionTier';
import { ValidationError } from '@/lib/utils/errors';
import { parseDecimalField } from '@/lib/utils/form';

export async function addTier(ruleId: string, formData: FormData) {
  const service = new CommissionTierService(new CommissionTierRepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.upsert({
      ruleId,
      thresholdFromUsd: parseDecimalField(
        'thresholdFromUsd',
        formData.get('thresholdFromUsd') as string | null,
      ),
      ratePct: parseDecimalField('ratePct', formData.get('ratePct') as string | null).div(100),
      sortOrder: parseInt((formData.get('sortOrder') as string | null) ?? '', 10) || 0,
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) redirect(`/admin/commissions/${ruleId}?error=${encodeURIComponent(errorMsg)}`);
  redirect(`/admin/commissions/${ruleId}`);
}

export async function deleteTier(tierId: string, ruleId: string) {
  const repo = new CommissionTierRepository(prisma);
  const tiers = await repo.findByRule(ruleId);
  if (!tiers.some((t) => t.id === tierId)) {
    redirect(`/admin/commissions/${ruleId}?error=${encodeURIComponent('Tier not found')}`);
  }
  await repo.delete(tierId);
  redirect(`/admin/commissions/${ruleId}`);
}
