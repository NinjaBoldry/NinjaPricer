'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';
import { ProductService } from '@/lib/services/product';
import { BundleRepository } from '@/lib/db/repositories/bundle';
import { BundleService } from '@/lib/services/bundle';

export async function renameProductAction(input: { id: string; newName: string }) {
  await requireAdmin();
  const service = new ProductService(new ProductRepository(prisma));
  await service.updateProduct(input.id, { name: input.newName.trim() });
  revalidatePath('/admin/sku-collisions');
}

export async function renameBundleAction(input: { id: string; newName: string }) {
  await requireAdmin();
  const service = new BundleService(new BundleRepository(prisma));
  await service.update(input.id, { name: input.newName.trim() });
  revalidatePath('/admin/sku-collisions');
}

export async function setProductSkuAction(input: { id: string; sku: string }) {
  await requireAdmin();
  const service = new ProductService(new ProductRepository(prisma));
  await service.updateProduct(input.id, { sku: input.sku });
  revalidatePath('/admin/sku-collisions');
}

export async function setBundleSkuAction(input: { id: string; sku: string }) {
  await requireAdmin();
  const service = new BundleService(new BundleRepository(prisma));
  await service.update(input.id, { sku: input.sku });
  revalidatePath('/admin/sku-collisions');
}
