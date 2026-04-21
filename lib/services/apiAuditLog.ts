import { createHash } from 'node:crypto';
import type { AuditResult } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ApiAuditLogRepository } from '@/lib/db/repositories/apiAuditLog';

export interface AppendAuditInput {
  tokenId: string;
  userId: string;
  toolName: string;
  args: unknown;
  targetEntityType?: string;
  targetEntityId?: string;
  result: AuditResult;
  errorCode?: string;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return out;
}

export function hashArgs(args: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(args))).digest('hex');
}

export async function appendAudit(
  input: AppendAuditInput,
  repo: ApiAuditLogRepository = new ApiAuditLogRepository(prisma),
) {
  return repo.append({
    tokenId: input.tokenId,
    userId: input.userId,
    toolName: input.toolName,
    argsHash: hashArgs(input.args),
    result: input.result,
    ...(input.targetEntityType !== undefined && { targetEntityType: input.targetEntityType }),
    ...(input.targetEntityId !== undefined && { targetEntityId: input.targetEntityId }),
    ...(input.errorCode !== undefined && { errorCode: input.errorCode }),
  });
}

export async function listAuditForToken(
  tokenId: string,
  take?: number,
  repo: ApiAuditLogRepository = new ApiAuditLogRepository(prisma),
) {
  return repo.listByToken(tokenId, take ?? 50);
}
