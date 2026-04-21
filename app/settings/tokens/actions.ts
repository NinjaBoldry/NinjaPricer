'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import {
  issueApiToken,
  listApiTokensForUser,
  revokeApiToken,
} from '@/lib/services/apiToken';
import { NotFoundError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';

export async function listMyTokensAction() {
  const user = await requireAuth();
  return listApiTokensForUser(user.id);
}

export async function issueMyTokenAction(formData: FormData) {
  const user = await requireAuth();
  const label = String(formData.get('label') ?? '').trim();
  if (!label) throw new Error('Label is required');
  const expiresRaw = String(formData.get('expiresAt') ?? '').trim();
  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;

  const { rawToken } = await issueApiToken({ ownerUserId: user.id, label, expiresAt });
  revalidatePath('/settings/tokens');
  return { rawToken };
}

export async function revokeMyTokenAction(formData: FormData) {
  const user = await requireAuth();
  const tokenId = String(formData.get('tokenId') ?? '');
  if (!tokenId) throw new Error('tokenId is required');
  const token = await prisma.apiToken.findUnique({ where: { id: tokenId } });
  if (!token || token.ownerUserId !== user.id) throw new NotFoundError('ApiToken', tokenId);
  await revokeApiToken(tokenId);
  revalidatePath('/settings/tokens');
}
