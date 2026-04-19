'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { PersonaRepository } from '@/lib/db/repositories/persona';
import { PersonaService } from '@/lib/services/persona';
import { ValidationError } from '@/lib/utils/errors';
import { parseDecimalField } from '@/lib/utils/form';

export async function upsertPersona(productId: string, formData: FormData) {
  const service = new PersonaService(new PersonaRepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.upsert({
      productId,
      name: formData.get('name') as string,
      multiplier: parseDecimalField('multiplier', formData.get('multiplier') as string | null, '1'),
      sortOrder: parseInt(formData.get('sortOrder') as string ?? '', 10),
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) {
    redirect(
      `/admin/products/${productId}/personas?error=${encodeURIComponent(errorMsg)}`,
    );
  }
  redirect(`/admin/products/${productId}/personas`);
}

export async function deletePersona(id: string, productId: string) {
  const service = new PersonaService(new PersonaRepository(prisma));
  await service.delete(id);
  redirect(`/admin/products/${productId}/personas`);
}
