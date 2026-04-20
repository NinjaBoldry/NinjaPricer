'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { BurdenRepository } from '@/lib/db/repositories/burden';
import { BurdenService } from '@/lib/services/burden';
import { ValidationError } from '@/lib/utils/errors';
import { parseDecimalField } from '@/lib/utils/form';

export async function upsertBurden(formData: FormData) {
  const service = new BurdenService(new BurdenRepository(prisma));
  const scope = formData.get('scope') as string;
  const capRaw = formData.get('capUsd') as string | null;
  let errorMsg: string | null = null;
  try {
    await service.upsert({
      name: formData.get('name') as string,
      ratePct: parseDecimalField('ratePct', formData.get('ratePct') as string | null),
      capUsd: capRaw?.trim() ? parseDecimalField('capUsd', capRaw) : undefined,
      scope,
      departmentId:
        scope === 'DEPARTMENT' ? (formData.get('departmentId') as string) || undefined : undefined,
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) redirect(`/admin/labor/burdens?error=${encodeURIComponent(errorMsg)}`);
  redirect('/admin/labor/burdens');
}

export async function deleteBurden(id: string) {
  const repo = new BurdenRepository(prisma);
  await repo.delete(id);
  redirect('/admin/labor/burdens');
}
