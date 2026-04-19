'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { BundleItemRepository } from '@/lib/db/repositories/bundleItem';
import { BundleItemService } from '@/lib/services/bundleItem';
import { ValidationError } from '@/lib/utils/errors';

export async function addBundleItem(bundleId: string, formData: FormData) {
  const productId = formData.get('productId') as string;
  const product = await prisma.product.findUnique({ where: { id: productId } });

  if (!product) {
    redirect(`/admin/bundles/${bundleId}?error=${encodeURIComponent('Product not found')}`);
    return;
  }

  let config: unknown;
  switch (product.kind) {
    case 'SAAS_USAGE':
      config = {
        kind: 'SAAS_USAGE',
        seatCount: parseInt(formData.get('seatCount') as string | null ?? '', 10) || 1,
        personaMix: [],
      };
      break;
    case 'PACKAGED_LABOR':
      config = {
        kind: 'PACKAGED_LABOR',
        qty: parseFloat(formData.get('qty') as string | null ?? '1') || 1,
        unit: formData.get('unit') as string || 'PER_DAY',
      };
      break;
    case 'CUSTOM_LABOR':
      config = {
        kind: 'CUSTOM_LABOR',
        hours: parseFloat(formData.get('hours') as string | null ?? '1') || 1,
      };
      break;
    default:
      redirect(`/admin/bundles/${bundleId}?error=${encodeURIComponent('Unknown product kind')}`);
      return;
  }

  let errorMsg: string | null = null;
  try {
    await new BundleItemService(new BundleItemRepository(prisma)).add({
      bundleId,
      productId,
      skuId: (formData.get('skuId') as string) || undefined,
      departmentId: (formData.get('departmentId') as string) || undefined,
      config,
      sortOrder: parseInt(formData.get('sortOrder') as string | null ?? '', 10) || 0,
    });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) redirect(`/admin/bundles/${bundleId}?error=${encodeURIComponent(errorMsg)}`);
  redirect(`/admin/bundles/${bundleId}`);
}

export async function removeBundleItem(itemId: string, bundleId: string) {
  const repo = new BundleItemRepository(prisma);
  const items = await repo.findByBundle(bundleId);
  if (!items.some((i) => i.id === itemId)) {
    redirect(`/admin/bundles/${bundleId}?error=${encodeURIComponent('Item not found')}`);
  }
  await repo.remove(itemId);
  redirect(`/admin/bundles/${bundleId}`);
}
