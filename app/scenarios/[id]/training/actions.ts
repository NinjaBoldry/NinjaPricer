'use server';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { ScenarioLaborLineRepository } from '@/lib/db/repositories/scenarioLaborLine';

export async function addTrainingLineFromSKU(formData: FormData) {
  await requireAuth();

  const skuId = String(formData.get('skuId') ?? '');
  const scenarioId = String(formData.get('scenarioId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const qty = String(formData.get('qty') ?? '1');
  const revenueOverride = formData.get('revenuePerUnit');

  const sku = await prisma.laborSKU.findUnique({ where: { id: skuId } });
  if (!sku) return;

  const repo = new ScenarioLaborLineRepository(prisma);
  await repo.create({
    scenarioId,
    productId,
    skuId,
    customDescription: sku.name,
    qty,
    unit: sku.unit,
    costPerUnitUsd: sku.costPerUnitUsd.toString(),
    revenuePerUnitUsd: revenueOverride
      ? String(revenueOverride)
      : sku.defaultRevenueUsd.toString(),
  });
  revalidatePath(`/scenarios/${scenarioId}/training`);
}

export async function addCustomTrainingLine(formData: FormData) {
  await requireAuth();

  const scenarioId = String(formData.get('scenarioId') ?? '');
  const productId = String(formData.get('productId') ?? '');
  const repo = new ScenarioLaborLineRepository(prisma);
  await repo.create({
    scenarioId,
    productId,
    customDescription: String(formData.get('description') ?? ''),
    qty: String(formData.get('qty') ?? '1'),
    unit: String(formData.get('unit') ?? 'unit'),
    costPerUnitUsd: '0',
    revenuePerUnitUsd: String(formData.get('revenuePerUnit') ?? '0'),
  });
  revalidatePath(`/scenarios/${scenarioId}/training`);
}

export async function deleteTrainingLine(id: string) {
  await requireAuth();
  await new ScenarioLaborLineRepository(prisma).deleteById(id);
  // revalidate happens via the form in LaborLineTable — caller is responsible
}
