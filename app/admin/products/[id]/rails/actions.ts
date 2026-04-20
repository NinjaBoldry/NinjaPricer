'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { RailRepository } from '@/lib/db/repositories/rail';
import { RailService } from '@/lib/services/rail';
import { ValidationError } from '@/lib/utils/errors';
import { parseDecimalField } from '@/lib/utils/form';

export async function upsertRail(productId: string, formData: FormData) {
  const service = new RailService(new RailRepository(prisma));
  let errorMsg: string | null = null;

  try {
    await service.upsert({
      productId,
      kind: formData.get('kind'),
      marginBasis: formData.get('marginBasis') || 'CONTRIBUTION',
      softThreshold: parseDecimalField(
        'softThreshold',
        formData.get('softThreshold') as string | null,
      ),
      hardThreshold: parseDecimalField(
        'hardThreshold',
        formData.get('hardThreshold') as string | null,
      ),
      isEnabled: formData.get('isEnabled') === 'true',
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }

  if (errorMsg) {
    redirect(`/admin/products/${productId}/rails?error=${encodeURIComponent(errorMsg)}`);
  }
  redirect(`/admin/products/${productId}/rails`);
}
