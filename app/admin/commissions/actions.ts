'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { CommissionRuleRepository } from '@/lib/db/repositories/commissionRule';
import { CommissionRuleService } from '@/lib/services/commissionRule';
import { ValidationError } from '@/lib/utils/errors';

export async function createCommissionRule(formData: FormData) {
  const service = new CommissionRuleService(new CommissionRuleRepository(prisma));
  const scopeProductId = formData.get('scopeProductId') as string | null;
  const scopeDepartmentId = formData.get('scopeDepartmentId') as string | null;
  let errorMsg: string | null = null;
  try {
    const rule = await service.create({
      name: formData.get('name') as string,
      scopeType: formData.get('scopeType') as string,
      baseMetric: formData.get('baseMetric') as string,
      scopeProductId: scopeProductId || undefined,
      scopeDepartmentId: scopeDepartmentId || undefined,
      notes: (formData.get('notes') as string) || undefined,
    });
    const created = rule as { id: string };
    redirect(`/admin/commissions/${created.id}`);
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) redirect(`/admin/commissions?error=${encodeURIComponent(errorMsg)}`);
  redirect('/admin/commissions');
}
