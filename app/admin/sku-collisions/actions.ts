'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

export async function renameProductAction(input: { id: string; newName: string }) {
  await requireAdmin();
  const name = input.newName.trim();
  if (!name) throw new Error('Name cannot be empty');
  await prisma.product.update({ where: { id: input.id }, data: { name } });
  revalidatePath('/admin/sku-collisions');
}

export async function renameBundleAction(input: { id: string; newName: string }) {
  await requireAdmin();
  const name = input.newName.trim();
  if (!name) throw new Error('Name cannot be empty');
  await prisma.bundle.update({ where: { id: input.id }, data: { name } });
  revalidatePath('/admin/sku-collisions');
}

export async function setProductSkuAction(input: { id: string; sku: string }) {
  await requireAdmin();
  const sku = input.sku.trim().toUpperCase();
  if (!sku) throw new Error('SKU cannot be empty');
  await prisma.product.update({ where: { id: input.id }, data: { sku } });
  revalidatePath('/admin/sku-collisions');
}

export async function setBundleSkuAction(input: { id: string; sku: string }) {
  await requireAdmin();
  const sku = input.sku.trim().toUpperCase();
  if (!sku) throw new Error('SKU cannot be empty');
  await prisma.bundle.update({ where: { id: input.id }, data: { sku } });
  revalidatePath('/admin/sku-collisions');
}
