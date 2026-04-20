'use server';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import { ScenarioService } from '@/lib/services/scenario';
import { ValidationError } from '@/lib/utils/errors';

function getService() {
  return new ScenarioService(new ScenarioRepository(prisma));
}

export async function createScenarioAction(formData: FormData) {
  const user = await requireAuth();
  const service = getService();

  let scenarioId: string;
  try {
    const result = await service.create({
      name: String(formData.get('name') ?? ''),
      customerName: String(formData.get('customerName') ?? ''),
      contractMonths: Number(formData.get('contractMonths')),
      ownerId: user.id,
    });
    scenarioId = (result as { id: string }).id;
  } catch (e) {
    if (e instanceof ValidationError) {
      redirect(`/scenarios/new?error=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
  redirect(`/scenarios/${scenarioId}/notes`);
}
