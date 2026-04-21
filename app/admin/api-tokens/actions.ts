'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { listAllApiTokens, revokeApiToken } from '@/lib/services/apiToken';
import { listAuditForToken } from '@/lib/services/apiAuditLog';

export async function listAllTokensAction() {
  await requireAdmin();
  return listAllApiTokens();
}

export async function listAuditForTokenAction(tokenId: string) {
  await requireAdmin();
  return listAuditForToken(tokenId);
}

export async function adminRevokeTokenAction(formData: FormData) {
  await requireAdmin();
  const tokenId = String(formData.get('tokenId') ?? '');
  if (!tokenId) throw new Error('tokenId is required');
  await revokeApiToken(tokenId);
  revalidatePath('/admin/api-tokens');
}
