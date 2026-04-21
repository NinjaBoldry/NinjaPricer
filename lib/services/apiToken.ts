import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '@/lib/db/client';
import { ApiTokenRepository } from '@/lib/db/repositories/apiToken';

export const TOKEN_PREFIX = 'np_live_';

export interface IssueInput {
  ownerUserId: string;
  label: string;
  expiresAt: Date | null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateRawToken(): string {
  // 32 bytes of entropy → 43 base64url characters (no padding).
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export async function issueApiToken(
  input: IssueInput,
  repo: ApiTokenRepository = new ApiTokenRepository(prisma),
) {
  const rawToken = generateRawToken();
  const token = await repo.create({
    label: input.label,
    tokenHash: sha256(rawToken),
    tokenPrefix: rawToken.slice(0, 8),
    ownerUserId: input.ownerUserId,
    expiresAt: input.expiresAt,
  });
  return { rawToken, token };
}

export async function verifyApiToken(
  rawToken: string,
  repo: ApiTokenRepository = new ApiTokenRepository(prisma),
) {
  if (!rawToken.startsWith(TOKEN_PREFIX)) return null;
  const row = await repo.findByHash(sha256(rawToken));
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  repo.touchLastUsed(row.id);
  return { token: row, user: row.owner };
}

export async function revokeApiToken(
  id: string,
  repo: ApiTokenRepository = new ApiTokenRepository(prisma),
) {
  return repo.revoke(id);
}

export async function listApiTokensForUser(
  ownerUserId: string,
  repo: ApiTokenRepository = new ApiTokenRepository(prisma),
) {
  return repo.listForUser(ownerUserId);
}

export async function listAllApiTokens(repo: ApiTokenRepository = new ApiTokenRepository(prisma)) {
  return repo.listAll();
}
