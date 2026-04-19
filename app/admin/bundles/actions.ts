'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { BundleRepository } from '@/lib/db/repositories/bundle';
import { BundleService } from '@/lib/services/bundle';
import { ValidationError } from '@/lib/utils/errors';

export async function createBundle(formData: FormData) {
  const service = new BundleService(new BundleRepository(prisma));
  let errorMsg: string | null = null;
  try {
    const bundle = await service.create({
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || undefined,
    });
    const created = bundle as { id: string };
    redirect(`/admin/bundles/${created.id}`);
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) redirect(`/admin/bundles?error=${encodeURIComponent(errorMsg)}`);
  redirect('/admin/bundles');
}
