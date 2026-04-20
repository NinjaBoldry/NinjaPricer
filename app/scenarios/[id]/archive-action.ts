'use server';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';

export async function archiveScenarioAction(formData: FormData) {
  await requireAuth();
  const scenarioId = String(formData.get('scenarioId') ?? '');
  if (!scenarioId) return;
  await new ScenarioRepository(prisma).archive(scenarioId);
  redirect('/scenarios');
}
