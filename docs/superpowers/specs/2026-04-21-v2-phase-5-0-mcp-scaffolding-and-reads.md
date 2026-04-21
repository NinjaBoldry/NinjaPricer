# Ninja Pricer v2 — Phase 5.0: MCP Scaffolding, Auth, Reads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a working MCP server at `/api/mcp` that authenticates per-user API tokens, exposes the 14 read-only tools (9 sales+admin + 5 admin-only), and ships a token-management UI so users can issue/revoke their own tokens.

**Architecture:** A single Next.js Route Handler at `app/api/mcp/route.ts` runs the official `@modelcontextprotocol/sdk` TypeScript server over Streamable HTTP. Bearer-token middleware resolves a token → owner → role; tools are thin Zod-validated wrappers over existing `lib/services/*` functions. No business logic is duplicated. An append-only `ApiAuditLog` table captures writes (used by 5.1/5.2; this phase only exercises the infrastructure with read tools).

**Tech Stack:** TypeScript (strict), Next.js 14 app router, Prisma, Postgres, NextAuth v5, Zod, `@modelcontextprotocol/sdk`, decimal.js, shadcn/ui + Tailwind, Vitest.

**Design spec:** [docs/superpowers/specs/2026-04-21-v2-mcp-server-design.md](./2026-04-21-v2-mcp-server-design.md)

---

## Conventions (inherited from Phases 1–4, restated for agentic workers)

- **TDD.** Write failing test → run → implement → run passing → commit.
- **One task = one commit** unless the task explicitly groups multiple commits.
- **Money stays in `decimal.js`** through computation; final output in integer cents where it crosses a module boundary. Unchanged from prior phases.
- **Pure engine.** No changes to `lib/engine/*` in Phase 5.
- **Repository pattern.** `lib/db/repositories/` = thin Prisma wrappers, constructor-injected `PrismaClient`. Services in `lib/services/` orchestrate repos + validation + errors. Tools in `lib/mcp/tools/*` call services, never Prisma.
- **Zod at the service boundary and at the tool boundary.** Services re-validate defensively even though tools have already Zod-parsed — services are reused by the web UI and can't trust upstream.
- **Typed errors.** `lib/utils/errors.ts` → `NotFoundError`, `ValidationError`, `RailHardBlockError`. Tools convert these to MCP JSON-RPC errors via `lib/mcp/errors.ts`.
- **Commit-message style:** conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `refactor:`, `docs:`).

---

## Goals

- `POST /api/mcp` accepts MCP Streamable HTTP requests, requires a valid bearer token, dispatches to tools, and returns MCP JSON-RPC responses.
- A sales-role token sees 9 + 7 = 16 tools via `tools/list`; an admin-role token sees all 63 (14 in this phase; the rest arrive in 5.1/5.2).
- Every user can self-serve a token at `/settings/tokens`. Admin sees all tokens at `/admin/api-tokens` and can revoke anyone's token.
- `lastUsedAt` updates on every authenticated request (fire-and-forget).
- Revoking a token is a flag, not a delete. Demoting a user's role instantly strips admin capability from their tokens on the next request (role is read at request time).
- One integration test proves the server speaks real MCP: an `@modelcontextprotocol/sdk` client can `initialize`, `tools/list`, and call `compute_quote` against a live test route.

## Non-Goals

- Scenario-write tools — Phase 5.1.
- Catalog-write tools — Phase 5.2.
- Service-account tokens — deferred to HubSpot effort.
- Rate limiting / IP allowlists.
- Audit-log UI pagination + filters beyond "last 50 entries per token" — v2 refinement.
- Editing existing tokens (label, expiry). V2 lets users revoke + reissue; in-place edit is a later polish.

---

## File Structure

### New

```
lib/mcp/
  server.ts                        # createMcpServer(): registers all tools
  auth.ts                          # bearer-token verification
  context.ts                       # McpContext type {user, token}
  errors.ts                        # typed-error → MCP JSON-RPC mapping
  tools/
    reads.ts                       # 9 sales+admin read tools
    adminReads.ts                  # 5 admin-only read tools

lib/db/repositories/
  apiToken.ts                      # + .test.ts
  apiAuditLog.ts                   # + .test.ts

lib/services/
  apiToken.ts                      # issue / revoke / list / verify / + .test.ts
  apiAuditLog.ts                   # append / + .test.ts

app/api/mcp/
  route.ts                         # POST handler; + route.test.ts
  protocol.test.ts                 # SDK-client conformance test

app/settings/tokens/
  page.tsx                         # self-serve list + new/revoke
  actions.ts
  NewTokenDialog.tsx
  RevokeButton.tsx

app/admin/api-tokens/
  page.tsx                         # cross-org list
  actions.ts
  TokenDrawer.tsx                  # drill-in: audit-log + revoke
```

### Modified

```
package.json                       # add @modelcontextprotocol/sdk
prisma/schema.prisma               # ApiToken, ApiAuditLog, AuditResult, User relations
components/TopNav.tsx              # optional: "Tokens" link in user menu
```

### Each file's one responsibility

- `lib/mcp/server.ts` — builds an MCP server with a context. Registers every tool file's handlers. No business logic.
- `lib/mcp/auth.ts` — resolves `Authorization: Bearer <token>` → `{user, token}` context or throws `UnauthorizedError`.
- `lib/mcp/errors.ts` — maps service-thrown errors to MCP error codes.
- `lib/mcp/tools/reads.ts` — registers the 9 sales+admin read tools. Each tool is ≤ 30 lines.
- `lib/mcp/tools/adminReads.ts` — registers the 5 admin-only read tools with `requireAdmin` at the top of each handler.
- `lib/services/apiToken.ts` — issue-format tokens, store hashed, verify hashed, revoke.
- `lib/services/apiAuditLog.ts` — append audit rows (no filtering/query logic yet; comes in admin UI task).
- `app/api/mcp/route.ts` — thin HTTP entry: read body → auth → server.handle → respond.

---

## Sub-phase Overview

| Sub-phase | Theme | Key output |
|-----------|-------|------------|
| 5.0-A | Install deps | `@modelcontextprotocol/sdk` in `package.json` |
| 5.0-B | Prisma schema | `ApiToken`, `ApiAuditLog`, `AuditResult` migrated |
| 5.0-C | Token repo | `ApiTokenRepository` with TDD |
| 5.0-D | Audit repo | `ApiAuditLogRepository` with TDD |
| 5.0-E | Token service | `issue/verify/revoke/list` with TDD |
| 5.0-F | Audit service | `append` with TDD |
| 5.0-G | MCP error map | Typed-error → JSON-RPC mapping |
| 5.0-H | MCP context + auth | Bearer middleware with TDD |
| 5.0-I | MCP server scaffold | `createMcpServer()` factory with tool-registration helper |
| 5.0-J | `/api/mcp` route | HTTP handler + integration test |
| 5.0-K | `compute_quote` tool | First tool — template |
| 5.0-L | Product + bundle read tools | 4 tools |
| 5.0-M | Scenario read tools | 2 tools (role-scoped) |
| 5.0-N | Quote read tools | 2 tools (incl. opt-in PDF bytes) |
| 5.0-O | Admin read tools | 5 tools (admin-gated) |
| 5.0-P | MCP protocol conformance test | SDK client → our route, round-trip |
| 5.0-Q | `/settings/tokens` UI | User self-serve |
| 5.0-R | `/admin/api-tokens` UI | Admin cross-user + drill-in |

---

## Task 5.0-A: Install `@modelcontextprotocol/sdk`

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

Run: `npm install @modelcontextprotocol/sdk@^1.0.0`

Expected: package.json and lock updated, no audit errors introduced.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add @modelcontextprotocol/sdk for MCP server"
```

---

## Task 5.0-B: Prisma schema — ApiToken + ApiAuditLog + User relations

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_mcp_tokens_and_audit/migration.sql` (generated)

- [ ] **Step 1: Add models to `prisma/schema.prisma`**

Append, and add the inverse relations on `User`:

```prisma
model ApiToken {
  id           String       @id @default(cuid())
  label        String
  tokenHash    String       @unique
  tokenPrefix  String
  ownerUserId  String
  lastUsedAt   DateTime?
  revokedAt    DateTime?
  expiresAt    DateTime?
  createdAt    DateTime     @default(now())
  owner        User         @relation("TokenOwner", fields: [ownerUserId], references: [id], onDelete: Cascade)
  auditEntries ApiAuditLog[]

  @@index([ownerUserId])
}

model ApiAuditLog {
  id               String       @id @default(cuid())
  tokenId          String
  userId           String
  toolName         String
  argsHash         String
  targetEntityType String?
  targetEntityId   String?
  result           AuditResult
  errorCode        String?
  createdAt        DateTime     @default(now())
  token            ApiToken     @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  user             User         @relation("AuditActor", fields: [userId], references: [id], onDelete: Cascade)

  @@index([tokenId, createdAt])
  @@index([userId, createdAt])
}

enum AuditResult {
  OK
  ERROR
}
```

On the existing `User` model, add:

```prisma
  apiTokens      ApiToken[]    @relation("TokenOwner")
  auditEntries   ApiAuditLog[] @relation("AuditActor")
```

- [ ] **Step 2: Generate migration**

Run: `npx prisma migrate dev --name mcp_tokens_and_audit --create-only`
Expected: a new migration file generated in `prisma/migrations/`. Review it — CREATE TABLE statements should include both tables and the enum.

- [ ] **Step 3: Apply migration**

Run: `npx prisma migrate dev`
Expected: migration applied, Prisma client regenerated, no prompts. If the CLI prompts about schema drift, abort and report — something else changed.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(mcp): ApiToken + ApiAuditLog schema"
```

---

## Task 5.0-C: ApiTokenRepository

**Files:**
- Create: `lib/db/repositories/apiToken.ts`
- Create: `lib/db/repositories/apiToken.test.ts`
- Modify: `lib/db/repositories/index.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/db/repositories/apiToken.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ApiTokenRepository } from './apiToken';

describe('ApiTokenRepository', () => {
  let mockDb: {
    apiToken: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let repo: ApiTokenRepository;

  beforeEach(() => {
    mockDb = {
      apiToken: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
    };
    repo = new ApiTokenRepository(mockDb as unknown as PrismaClient);
  });

  it('create persists all fields', async () => {
    mockDb.apiToken.create.mockResolvedValue({ id: 't1' });
    await repo.create({
      label: 'Bo Cowork',
      tokenHash: 'abc',
      tokenPrefix: 'np_live_',
      ownerUserId: 'u1',
      expiresAt: null,
    });
    expect(mockDb.apiToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        label: 'Bo Cowork',
        tokenHash: 'abc',
        tokenPrefix: 'np_live_',
        ownerUserId: 'u1',
      }),
    });
  });

  it('findByHash includes owner', async () => {
    mockDb.apiToken.findUnique.mockResolvedValue({ id: 't1', owner: { id: 'u1', role: 'ADMIN' } });
    const t = await repo.findByHash('abc');
    expect(mockDb.apiToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: 'abc' },
      include: { owner: true },
    });
    expect(t?.owner.role).toBe('ADMIN');
  });

  it('listForUser returns non-revoked by default, ordered by createdAt desc', async () => {
    mockDb.apiToken.findMany.mockResolvedValue([]);
    await repo.listForUser('u1');
    expect(mockDb.apiToken.findMany).toHaveBeenCalledWith({
      where: { ownerUserId: 'u1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('listAll joins owner for admin UI', async () => {
    mockDb.apiToken.findMany.mockResolvedValue([]);
    await repo.listAll();
    expect(mockDb.apiToken.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { id: true, email: true, name: true, role: true } } },
    });
  });

  it('revoke stamps revokedAt with server time', async () => {
    mockDb.apiToken.update.mockResolvedValue({ id: 't1' });
    const before = Date.now();
    await repo.revoke('t1');
    const after = Date.now();
    const call = mockDb.apiToken.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 't1' });
    const stamped = (call.data.revokedAt as Date).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });

  it('touchLastUsed updates lastUsedAt without awaiting the write', async () => {
    mockDb.apiToken.update.mockResolvedValue({ id: 't1' });
    repo.touchLastUsed('t1');
    // resolves independently; we just verify the update was issued
    await vi.waitFor(() => {
      expect(mockDb.apiToken.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });
  });
});
```

- [ ] **Step 2: Run test — fail**

Run: `npx vitest run lib/db/repositories/apiToken.test.ts`
Expected: `Cannot find module './apiToken'`.

- [ ] **Step 3: Implement**

Create `lib/db/repositories/apiToken.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';

export interface CreateApiTokenInput {
  label: string;
  tokenHash: string;
  tokenPrefix: string;
  ownerUserId: string;
  expiresAt: Date | null;
}

export class ApiTokenRepository {
  constructor(private db: PrismaClient) {}

  async create(data: CreateApiTokenInput) {
    return this.db.apiToken.create({
      data: {
        label: data.label,
        tokenHash: data.tokenHash,
        tokenPrefix: data.tokenPrefix,
        ownerUserId: data.ownerUserId,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findByHash(tokenHash: string) {
    return this.db.apiToken.findUnique({
      where: { tokenHash },
      include: { owner: true },
    });
  }

  async listForUser(ownerUserId: string) {
    return this.db.apiToken.findMany({
      where: { ownerUserId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAll() {
    return this.db.apiToken.findMany({
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { id: true, email: true, name: true, role: true } } },
    });
  }

  async revoke(id: string) {
    return this.db.apiToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  touchLastUsed(id: string): void {
    // Fire-and-forget. Errors are swallowed because touching is non-critical.
    void this.db.apiToken
      .update({ where: { id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }
}
```

- [ ] **Step 4: Add export to repositories index**

Edit `lib/db/repositories/index.ts`, add line (alphabetically or near related entries):

```typescript
export { ApiTokenRepository } from './apiToken';
```

- [ ] **Step 5: Run tests — pass**

Run: `npx vitest run lib/db/repositories/apiToken.test.ts`
Expected: 6 tests passing.

- [ ] **Step 6: Commit**

```bash
git add lib/db/repositories/apiToken.ts lib/db/repositories/apiToken.test.ts lib/db/repositories/index.ts
git commit -m "feat(mcp): ApiTokenRepository"
```

---

## Task 5.0-D: ApiAuditLogRepository

**Files:**
- Create: `lib/db/repositories/apiAuditLog.ts`
- Create: `lib/db/repositories/apiAuditLog.test.ts`
- Modify: `lib/db/repositories/index.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/db/repositories/apiAuditLog.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ApiAuditLogRepository } from './apiAuditLog';

describe('ApiAuditLogRepository', () => {
  let mockDb: {
    apiAuditLog: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let repo: ApiAuditLogRepository;

  beforeEach(() => {
    mockDb = { apiAuditLog: { create: vi.fn(), findMany: vi.fn() } };
    repo = new ApiAuditLogRepository(mockDb as unknown as PrismaClient);
  });

  it('append persists all fields with defaulted nullable columns', async () => {
    mockDb.apiAuditLog.create.mockResolvedValue({ id: 'a1' });
    await repo.append({
      tokenId: 't1',
      userId: 'u1',
      toolName: 'create_product',
      argsHash: 'h',
      result: 'OK',
    });
    expect(mockDb.apiAuditLog.create).toHaveBeenCalledWith({
      data: {
        tokenId: 't1',
        userId: 'u1',
        toolName: 'create_product',
        argsHash: 'h',
        result: 'OK',
        targetEntityType: null,
        targetEntityId: null,
        errorCode: null,
      },
    });
  });

  it('listByToken returns most recent first, limited to N', async () => {
    mockDb.apiAuditLog.findMany.mockResolvedValue([]);
    await repo.listByToken('t1', 50);
    expect(mockDb.apiAuditLog.findMany).toHaveBeenCalledWith({
      where: { tokenId: 't1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });
});
```

- [ ] **Step 2: Run test — fail**

Run: `npx vitest run lib/db/repositories/apiAuditLog.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `lib/db/repositories/apiAuditLog.ts`:

```typescript
import type { PrismaClient, AuditResult } from '@prisma/client';

export interface AppendAuditInput {
  tokenId: string;
  userId: string;
  toolName: string;
  argsHash: string;
  targetEntityType?: string;
  targetEntityId?: string;
  result: AuditResult;
  errorCode?: string;
}

export class ApiAuditLogRepository {
  constructor(private db: PrismaClient) {}

  async append(input: AppendAuditInput) {
    return this.db.apiAuditLog.create({
      data: {
        tokenId: input.tokenId,
        userId: input.userId,
        toolName: input.toolName,
        argsHash: input.argsHash,
        result: input.result,
        targetEntityType: input.targetEntityType ?? null,
        targetEntityId: input.targetEntityId ?? null,
        errorCode: input.errorCode ?? null,
      },
    });
  }

  async listByToken(tokenId: string, take: number) {
    return this.db.apiAuditLog.findMany({
      where: { tokenId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
```

- [ ] **Step 4: Add export**

In `lib/db/repositories/index.ts`:

```typescript
export { ApiAuditLogRepository } from './apiAuditLog';
```

- [ ] **Step 5: Run tests — pass**

Run: `npx vitest run lib/db/repositories/apiAuditLog.test.ts`
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/db/repositories/apiAuditLog.ts lib/db/repositories/apiAuditLog.test.ts lib/db/repositories/index.ts
git commit -m "feat(mcp): ApiAuditLogRepository"
```

---

## Task 5.0-E: ApiTokenService

**Files:**
- Create: `lib/services/apiToken.ts`
- Create: `lib/services/apiToken.test.ts`
- Modify: `lib/services/index.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/services/apiToken.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('@/lib/db/client', () => ({ prisma: {} }));
vi.mock('@/lib/db/repositories/apiToken', () => ({
  ApiTokenRepository: vi.fn(function (this: any) {
    this.create = vi.fn();
    this.findByHash = vi.fn();
    this.listForUser = vi.fn();
    this.listAll = vi.fn();
    this.revoke = vi.fn();
    this.touchLastUsed = vi.fn();
    return this;
  }),
}));

import { ApiTokenRepository } from '@/lib/db/repositories/apiToken';
import {
  issueApiToken,
  verifyApiToken,
  revokeApiToken,
  listApiTokensForUser,
  listAllApiTokens,
  TOKEN_PREFIX,
} from './apiToken';

function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

describe('ApiTokenService', () => {
  let repo: any;
  beforeEach(() => {
    vi.clearAllMocks();
    repo = new (ApiTokenRepository as any)();
  });

  describe('issueApiToken', () => {
    it('generates a prefixed raw token, stores its sha256, returns raw once', async () => {
      repo.create.mockResolvedValue({ id: 't1' });
      const out = await issueApiToken(
        { ownerUserId: 'u1', label: 'Cowork', expiresAt: null },
        repo,
      );
      expect(out.rawToken.startsWith(TOKEN_PREFIX)).toBe(true);
      expect(out.rawToken.length).toBe(TOKEN_PREFIX.length + 43); // base64url 32 bytes = 43 chars
      expect(repo.create).toHaveBeenCalledWith({
        label: 'Cowork',
        tokenHash: sha256(out.rawToken),
        tokenPrefix: out.rawToken.slice(0, 8),
        ownerUserId: 'u1',
        expiresAt: null,
      });
      expect(out.token.id).toBe('t1');
    });
  });

  describe('verifyApiToken', () => {
    const raw = 'np_live_' + 'x'.repeat(43);
    const hash = sha256(raw);

    it('returns the token + owner when valid, and touches lastUsedAt', async () => {
      const now = new Date();
      repo.findByHash.mockResolvedValue({
        id: 't1',
        revokedAt: null,
        expiresAt: null,
        owner: { id: 'u1', role: 'ADMIN' },
      });
      const out = await verifyApiToken(raw, repo);
      expect(repo.findByHash).toHaveBeenCalledWith(hash);
      expect(repo.touchLastUsed).toHaveBeenCalledWith('t1');
      expect(out?.user.role).toBe('ADMIN');
    });

    it('returns null for unknown hash', async () => {
      repo.findByHash.mockResolvedValue(null);
      expect(await verifyApiToken(raw, repo)).toBe(null);
    });

    it('returns null for revoked token', async () => {
      repo.findByHash.mockResolvedValue({
        id: 't1',
        revokedAt: new Date(),
        expiresAt: null,
        owner: { id: 'u1', role: 'SALES' },
      });
      expect(await verifyApiToken(raw, repo)).toBe(null);
    });

    it('returns null for expired token', async () => {
      repo.findByHash.mockResolvedValue({
        id: 't1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        owner: { id: 'u1', role: 'SALES' },
      });
      expect(await verifyApiToken(raw, repo)).toBe(null);
    });

    it('returns null if prefix is wrong', async () => {
      expect(await verifyApiToken('wrong_prefix_abc', repo)).toBe(null);
      expect(repo.findByHash).not.toHaveBeenCalled();
    });
  });

  it('revokeApiToken calls repo.revoke', async () => {
    repo.revoke.mockResolvedValue({ id: 't1' });
    await revokeApiToken('t1', repo);
    expect(repo.revoke).toHaveBeenCalledWith('t1');
  });

  it('listApiTokensForUser forwards to repo', async () => {
    repo.listForUser.mockResolvedValue([]);
    await listApiTokensForUser('u1', repo);
    expect(repo.listForUser).toHaveBeenCalledWith('u1');
  });

  it('listAllApiTokens forwards to repo', async () => {
    repo.listAll.mockResolvedValue([]);
    await listAllApiTokens(repo);
    expect(repo.listAll).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/services/apiToken.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `lib/services/apiToken.ts`:

```typescript
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

export async function listAllApiTokens(
  repo: ApiTokenRepository = new ApiTokenRepository(prisma),
) {
  return repo.listAll();
}
```

- [ ] **Step 4: Add export**

In `lib/services/index.ts`:

```typescript
export {
  issueApiToken,
  verifyApiToken,
  revokeApiToken,
  listApiTokensForUser,
  listAllApiTokens,
  TOKEN_PREFIX,
} from './apiToken';
```

- [ ] **Step 5: Run — pass**

Run: `npx vitest run lib/services/apiToken.test.ts`
Expected: 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/services/apiToken.ts lib/services/apiToken.test.ts lib/services/index.ts
git commit -m "feat(mcp): ApiTokenService with issue/verify/revoke/list"
```

---

## Task 5.0-F: ApiAuditLogService

**Files:**
- Create: `lib/services/apiAuditLog.ts`
- Create: `lib/services/apiAuditLog.test.ts`
- Modify: `lib/services/index.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/services/apiAuditLog.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({ prisma: {} }));
vi.mock('@/lib/db/repositories/apiAuditLog', () => ({
  ApiAuditLogRepository: vi.fn(function (this: any) {
    this.append = vi.fn();
    this.listByToken = vi.fn();
    return this;
  }),
}));

import { ApiAuditLogRepository } from '@/lib/db/repositories/apiAuditLog';
import { appendAudit, listAuditForToken, hashArgs } from './apiAuditLog';

describe('ApiAuditLogService', () => {
  let repo: any;
  beforeEach(() => {
    vi.clearAllMocks();
    repo = new (ApiAuditLogRepository as any)();
  });

  it('hashArgs returns deterministic sha256 of JSON-stringified args', () => {
    expect(hashArgs({ a: 1, b: 2 })).toBe(hashArgs({ b: 2, a: 1 }));
    expect(hashArgs({ a: 1 })).not.toBe(hashArgs({ a: 2 }));
    expect(hashArgs({ a: 1 })).toHaveLength(64);
  });

  it('appendAudit forwards all fields', async () => {
    repo.append.mockResolvedValue({ id: 'a1' });
    await appendAudit(
      {
        tokenId: 't1',
        userId: 'u1',
        toolName: 'update_product',
        args: { id: 'p1', name: 'Foo' },
        targetEntityType: 'Product',
        targetEntityId: 'p1',
        result: 'OK',
      },
      repo,
    );
    expect(repo.append).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 't1',
        userId: 'u1',
        toolName: 'update_product',
        argsHash: expect.any(String),
        targetEntityType: 'Product',
        targetEntityId: 'p1',
        result: 'OK',
      }),
    );
  });

  it('listAuditForToken defaults to 50 entries', async () => {
    repo.listByToken.mockResolvedValue([]);
    await listAuditForToken('t1', undefined, repo);
    expect(repo.listByToken).toHaveBeenCalledWith('t1', 50);
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/services/apiAuditLog.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `lib/services/apiAuditLog.ts`:

```typescript
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
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    result: input.result,
    errorCode: input.errorCode,
  });
}

export async function listAuditForToken(
  tokenId: string,
  take?: number,
  repo: ApiAuditLogRepository = new ApiAuditLogRepository(prisma),
) {
  return repo.listByToken(tokenId, take ?? 50);
}
```

- [ ] **Step 4: Add export**

In `lib/services/index.ts`:

```typescript
export { appendAudit, listAuditForToken, hashArgs } from './apiAuditLog';
```

- [ ] **Step 5: Run — pass**

Run: `npx vitest run lib/services/apiAuditLog.test.ts`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/services/apiAuditLog.ts lib/services/apiAuditLog.test.ts lib/services/index.ts
git commit -m "feat(mcp): ApiAuditLogService with deterministic args hashing"
```

---

## Task 5.0-G: MCP error mapping

**Files:**
- Create: `lib/mcp/errors.ts`
- Create: `lib/mcp/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/mcp/errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { NotFoundError, ValidationError, RailHardBlockError } from '@/lib/utils/errors';
import { ZodError, z } from 'zod';
import { toMcpError, McpErrorCode } from './errors';

describe('toMcpError', () => {
  it('maps UnauthorizedError', () => {
    const err = toMcpError(new Error('missing bearer'));
    // Plain Error with no typed class falls through to Internal
    expect(err.code).toBe(McpErrorCode.InternalError);
  });

  it('maps NotFoundError to -32004', () => {
    const out = toMcpError(new NotFoundError('Scenario', 's1'));
    expect(out.code).toBe(McpErrorCode.NotFound);
    expect(out.message).toContain('Scenario not found: s1');
  });

  it('maps ValidationError to -32602 with field', () => {
    const out = toMcpError(new ValidationError('seatCount', 'must be positive'));
    expect(out.code).toBe(McpErrorCode.InvalidParams);
    expect(out.message).toContain('seatCount');
  });

  it('maps RailHardBlockError to -32003 with measured/threshold', () => {
    const out = toMcpError(new RailHardBlockError('MIN_MARGIN_PCT', 0.1, 0.15));
    expect(out.code).toBe(McpErrorCode.RailHardBlock);
    expect(out.message).toContain('MIN_MARGIN_PCT');
    expect(out.data).toMatchObject({ measured: 0.1, threshold: 0.15 });
  });

  it('maps ZodError to -32602 Invalid params', () => {
    let zErr: ZodError;
    try {
      z.object({ n: z.number() }).parse({ n: 'x' });
      throw new Error('unreachable');
    } catch (e) {
      zErr = e as ZodError;
    }
    const out = toMcpError(zErr!);
    expect(out.code).toBe(McpErrorCode.InvalidParams);
  });

  it('maps unknown errors to -32603 Internal', () => {
    const out = toMcpError(new TypeError('boom'));
    expect(out.code).toBe(McpErrorCode.InternalError);
    expect(out.message).toBe('Internal error');
  });
});

describe('UnauthorizedError and ForbiddenError (from this module)', () => {
  it('map to -32001 and -32002', async () => {
    const { UnauthorizedError, ForbiddenError } = await import('./errors');
    expect(toMcpError(new UnauthorizedError()).code).toBe(McpErrorCode.Unauthorized);
    expect(toMcpError(new ForbiddenError('admin required')).code).toBe(McpErrorCode.Forbidden);
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/mcp/errors.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `lib/mcp/errors.ts`:

```typescript
import { ZodError } from 'zod';
import { NotFoundError, ValidationError, RailHardBlockError } from '@/lib/utils/errors';

export const McpErrorCode = {
  Unauthorized: -32001,
  Forbidden: -32002,
  RailHardBlock: -32003,
  NotFound: -32004,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export class UnauthorizedError extends Error {
  override readonly name = 'UnauthorizedError';
}

export class ForbiddenError extends Error {
  override readonly name = 'ForbiddenError';
}

export interface McpErrorResponse {
  code: number;
  message: string;
  data?: Record<string, unknown>;
}

export function toMcpError(err: unknown): McpErrorResponse {
  if (err instanceof UnauthorizedError) {
    return { code: McpErrorCode.Unauthorized, message: err.message || 'Unauthorized' };
  }
  if (err instanceof ForbiddenError) {
    return { code: McpErrorCode.Forbidden, message: err.message };
  }
  if (err instanceof NotFoundError) {
    return {
      code: McpErrorCode.NotFound,
      message: `${err.entity} not found: ${err.id}`,
    };
  }
  if (err instanceof ValidationError) {
    return {
      code: McpErrorCode.InvalidParams,
      message: `Invalid: ${err.field}: ${err.reason}`,
    };
  }
  if (err instanceof RailHardBlockError) {
    return {
      code: McpErrorCode.RailHardBlock,
      message: `Rail hard-block: ${err.railKey}; measured ${err.measured} vs threshold ${err.threshold}`,
      data: { railKey: err.railKey, measured: err.measured, threshold: err.threshold },
    };
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return {
      code: McpErrorCode.InvalidParams,
      message: `Invalid params: ${first?.path.join('.') || '<root>'}: ${first?.message || 'validation failed'}`,
    };
  }
  return { code: McpErrorCode.InternalError, message: 'Internal error' };
}
```

- [ ] **Step 4: Run — pass**

Run: `npx vitest run lib/mcp/errors.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/errors.ts lib/mcp/errors.test.ts
git commit -m "feat(mcp): typed-error -> JSON-RPC code mapping"
```

---

## Task 5.0-H: MCP context + bearer auth middleware

**Files:**
- Create: `lib/mcp/context.ts`
- Create: `lib/mcp/auth.ts`
- Create: `lib/mcp/auth.test.ts`

- [ ] **Step 1: Implement context type**

Create `lib/mcp/context.ts`:

```typescript
import type { Role } from '@prisma/client';

export interface McpUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export interface McpToken {
  id: string;
  label: string;
  ownerUserId: string;
}

export interface McpContext {
  user: McpUser;
  token: McpToken;
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/mcp/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/services/apiToken', () => ({
  verifyApiToken: vi.fn(),
}));

import { verifyApiToken } from '@/lib/services/apiToken';
import { authenticateMcpRequest } from './auth';
import { UnauthorizedError } from './errors';

describe('authenticateMcpRequest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws Unauthorized when header missing', async () => {
    const req = new Request('http://x', { method: 'POST' });
    await expect(authenticateMcpRequest(req)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws Unauthorized when scheme is not Bearer', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: { Authorization: 'Basic abc' },
    });
    await expect(authenticateMcpRequest(req)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws Unauthorized when verifyApiToken returns null', async () => {
    vi.mocked(verifyApiToken).mockResolvedValue(null);
    const req = new Request('http://x', {
      method: 'POST',
      headers: { Authorization: 'Bearer np_live_bad' },
    });
    await expect(authenticateMcpRequest(req)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('returns McpContext on success', async () => {
    vi.mocked(verifyApiToken).mockResolvedValue({
      token: { id: 't1', label: 'Cowork', ownerUserId: 'u1' } as never,
      user: { id: 'u1', email: 'a@b.com', name: 'A', role: 'ADMIN' } as never,
    });
    const req = new Request('http://x', {
      method: 'POST',
      headers: { Authorization: 'Bearer np_live_good' },
    });
    const ctx = await authenticateMcpRequest(req);
    expect(ctx.user.role).toBe('ADMIN');
    expect(ctx.token.id).toBe('t1');
  });
});
```

- [ ] **Step 3: Run — fail**

Run: `npx vitest run lib/mcp/auth.test.ts`
Expected: module-not-found.

- [ ] **Step 4: Implement**

Create `lib/mcp/auth.ts`:

```typescript
import { verifyApiToken } from '@/lib/services/apiToken';
import { UnauthorizedError } from './errors';
import type { McpContext } from './context';

export async function authenticateMcpRequest(request: Request): Promise<McpContext> {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header) throw new UnauthorizedError('Missing Authorization header');
  const [scheme, raw] = header.split(' ');
  if (scheme !== 'Bearer' || !raw) throw new UnauthorizedError('Expected Bearer token');

  const verified = await verifyApiToken(raw);
  if (!verified) throw new UnauthorizedError('Invalid or expired token');

  return {
    user: {
      id: verified.user.id,
      email: verified.user.email,
      name: verified.user.name,
      role: verified.user.role,
    },
    token: {
      id: verified.token.id,
      label: verified.token.label,
      ownerUserId: verified.token.ownerUserId,
    },
  };
}
```

- [ ] **Step 5: Run — pass**

Run: `npx vitest run lib/mcp/auth.test.ts`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/mcp/context.ts lib/mcp/auth.ts lib/mcp/auth.test.ts
git commit -m "feat(mcp): bearer-token auth middleware + McpContext"
```

---

## Task 5.0-I: MCP server scaffold

**Files:**
- Create: `lib/mcp/server.ts`
- Create: `lib/mcp/server.test.ts`

This task creates the factory + tool-registration helpers. No tools are registered yet — that happens in 5.0-K onward.

- [ ] **Step 1: Write the failing test**

Create `lib/mcp/server.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createMcpServer, type ToolDefinition } from './server';
import { ForbiddenError } from './errors';
import { z } from 'zod';
import type { McpContext } from './context';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: 'A', role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};
const salesCtx: McpContext = {
  user: { id: 'u2', email: 's@b', name: 'S', role: 'SALES' },
  token: { id: 't2', label: 'y', ownerUserId: 'u2' },
};

const probe: ToolDefinition = {
  name: 'probe',
  description: 'Returns { ok: true }',
  inputSchema: z.object({}),
  requiresAdmin: false,
  handler: async () => ({ ok: true }),
};

const adminOnly: ToolDefinition = {
  name: 'admin_probe',
  description: 'Admin only. Returns { adminOk: true }',
  inputSchema: z.object({}),
  requiresAdmin: true,
  handler: async () => ({ adminOk: true }),
};

describe('createMcpServer', () => {
  it('listTools returns admin tools only for admin ctx', () => {
    const server = createMcpServer([probe, adminOnly]);
    expect(server.listTools(adminCtx).map((t) => t.name)).toEqual(['probe', 'admin_probe']);
    expect(server.listTools(salesCtx).map((t) => t.name)).toEqual(['probe']);
  });

  it('callTool runs the handler and returns its output', async () => {
    const server = createMcpServer([probe]);
    const out = await server.callTool('probe', {}, adminCtx);
    expect(out).toEqual({ ok: true });
  });

  it('callTool rejects sales caller on admin-only tool with ForbiddenError', async () => {
    const server = createMcpServer([adminOnly]);
    await expect(server.callTool('admin_probe', {}, salesCtx)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('callTool rejects unknown tool name with ForbiddenError (do not leak existence)', async () => {
    const server = createMcpServer([probe]);
    await expect(server.callTool('nope', {}, adminCtx)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('callTool Zod-parses input before invoking handler', async () => {
    const typed: ToolDefinition = {
      name: 'typed',
      description: 'd',
      inputSchema: z.object({ n: z.number() }),
      requiresAdmin: false,
      handler: vi.fn(async (_ctx, input: { n: number }) => ({ doubled: input.n * 2 })),
    };
    const server = createMcpServer([typed]);
    await expect(server.callTool('typed', { n: 'x' }, adminCtx)).rejects.toThrow();
    expect(await server.callTool('typed', { n: 3 }, adminCtx)).toEqual({ doubled: 6 });
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/mcp/server.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `lib/mcp/server.ts`:

```typescript
import type { z } from 'zod';
import { ForbiddenError } from './errors';
import type { McpContext } from './context';

export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  requiresAdmin: boolean;
  handler: (ctx: McpContext, input: I) => Promise<O>;
}

export interface McpServer {
  listTools(ctx: McpContext): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  callTool(name: string, rawInput: unknown, ctx: McpContext): Promise<unknown>;
}

export function createMcpServer(tools: ToolDefinition[]): McpServer {
  const byName = new Map(tools.map((t) => [t.name, t]));

  function visibleTools(ctx: McpContext): ToolDefinition[] {
    return tools.filter((t) => !t.requiresAdmin || ctx.user.role === 'ADMIN');
  }

  function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
    // Placeholder JSON Schema shape. The @modelcontextprotocol/sdk's higher-level
    // tools accept Zod schemas directly; this function is only used when we need a
    // plain JSON Schema for debugging tests. The real wire-encoding is owned by
    // the SDK transport in app/api/mcp/route.ts.
    return { $zod: schema.description ?? 'ZodType' };
  }

  return {
    listTools(ctx) {
      return visibleTools(ctx).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(t.inputSchema),
      }));
    },
    async callTool(name, rawInput, ctx) {
      const tool = byName.get(name);
      if (!tool) throw new ForbiddenError(`Unknown tool: ${name}`);
      if (tool.requiresAdmin && ctx.user.role !== 'ADMIN') {
        throw new ForbiddenError(`Forbidden: admin role required for ${name}`);
      }
      const parsed = tool.inputSchema.parse(rawInput);
      return tool.handler(ctx, parsed);
    },
  };
}
```

- [ ] **Step 4: Run — pass**

Run: `npx vitest run lib/mcp/server.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/server.ts lib/mcp/server.test.ts
git commit -m "feat(mcp): server factory with RBAC-filtered tool list"
```

---

## Task 5.0-J: `/api/mcp` route

**Files:**
- Create: `app/api/mcp/route.ts`
- Create: `app/api/mcp/route.test.ts`

This task wires the auth middleware and the server into an HTTP handler. Until 5.0-K lands, the handler registers an empty tool list, so the integration test only exercises auth + JSON-RPC shape.

- [ ] **Step 1: Write the failing test**

Create `app/api/mcp/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/mcp/auth', () => ({
  authenticateMcpRequest: vi.fn(),
}));

import { authenticateMcpRequest } from '@/lib/mcp/auth';
import { UnauthorizedError } from '@/lib/mcp/errors';
import { POST } from './route';

function jsonRpcReq(method: string, params: unknown = {}) {
  return new Request('http://x/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer np_live_x' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

describe('POST /api/mcp', () => {
  it('returns JSON-RPC 401 wrapper on UnauthorizedError', async () => {
    vi.mocked(authenticateMcpRequest).mockRejectedValue(new UnauthorizedError('nope'));
    const res = await POST(jsonRpcReq('tools/list'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error.code).toBe(-32001);
  });

  it('returns empty tools/list for an authed request', async () => {
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      user: { id: 'u1', email: 'a', name: null, role: 'ADMIN' },
      token: { id: 't1', label: 'x', ownerUserId: 'u1' },
    });
    const res = await POST(jsonRpcReq('tools/list'));
    const body = await res.json();
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(1);
    expect(Array.isArray(body.result.tools)).toBe(true);
  });

  it('returns Method not found for unknown JSON-RPC method', async () => {
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      user: { id: 'u1', email: 'a', name: null, role: 'ADMIN' },
      token: { id: 't1', label: 'x', ownerUserId: 'u1' },
    });
    const res = await POST(jsonRpcReq('bogus/method'));
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run app/api/mcp/route.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `app/api/mcp/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { authenticateMcpRequest } from '@/lib/mcp/auth';
import { createMcpServer } from '@/lib/mcp/server';
import { toMcpError } from '@/lib/mcp/errors';

// Tools are registered here. 5.0-K onward will add to this list.
const tools: Parameters<typeof createMcpServer>[0] = [];

const server = createMcpServer(tools);

interface JsonRpcEnvelope {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
}

function rpcOk(id: JsonRpcEnvelope['id'], result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result });
}

function rpcErr(id: JsonRpcEnvelope['id'], code: number, message: string, data?: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message, data } });
}

export async function POST(request: Request) {
  let env: JsonRpcEnvelope;
  try {
    env = (await request.json()) as JsonRpcEnvelope;
  } catch {
    return rpcErr(null, -32700, 'Parse error');
  }

  try {
    const ctx = await authenticateMcpRequest(request);

    if (env.method === 'initialize') {
      return rpcOk(env.id, {
        protocolVersion: '2025-03-26',
        serverInfo: { name: 'ninja-pricer', version: '0.1.0' },
        capabilities: { tools: {} },
      });
    }

    if (env.method === 'tools/list') {
      return rpcOk(env.id, { tools: server.listTools(ctx) });
    }

    if (env.method === 'tools/call') {
      const params = (env.params ?? {}) as { name?: string; arguments?: unknown };
      if (typeof params.name !== 'string') {
        return rpcErr(env.id, -32602, 'Invalid params: name required');
      }
      const out = await server.callTool(params.name, params.arguments ?? {}, ctx);
      return rpcOk(env.id, { content: [{ type: 'json', json: out }] });
    }

    return rpcErr(env.id, -32601, `Method not found: ${env.method}`);
  } catch (err) {
    const mapped = toMcpError(err);
    return rpcErr(env.id ?? null, mapped.code, mapped.message, mapped.data);
  }
}
```

- [ ] **Step 4: Run — pass**

Run: `npx vitest run app/api/mcp/route.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/mcp/route.ts app/api/mcp/route.test.ts
git commit -m "feat(mcp): POST /api/mcp handler with JSON-RPC envelope"
```

---

## Task 5.0-K: `compute_quote` tool (template)

**Files:**
- Create: `lib/mcp/tools/reads.ts`
- Create: `lib/mcp/tools/reads.test.ts`
- Modify: `app/api/mcp/route.ts` (register the tool)

This task is the template for every subsequent read tool: Zod schema → call existing service → return plain JSON.

- [ ] **Step 1: Write the failing test**

Create `lib/mcp/tools/reads.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import Decimal from 'decimal.js';
import { computeQuoteTool } from './reads';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/engine', () => ({
  compute: vi.fn(() => ({
    perTab: [],
    totals: {
      monthlyCostCents: 0,
      monthlyRevenueCents: 0,
      contractCostCents: 0,
      contractRevenueCents: 12000,
      contributionMarginCents: 12000,
      netMarginCents: 12000,
      marginPctContribution: 1,
      marginPctNet: 1,
    },
    commissions: [],
    warnings: [],
  })),
}));

import { compute } from '@/lib/engine';

const ctx: McpContext = {
  user: { id: 'u1', email: 'a', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};

describe('compute_quote tool', () => {
  it('validates the request shape and calls the engine', async () => {
    const out = await computeQuoteTool.handler(ctx, {
      contractMonths: 12,
      tabs: [],
      products: { saas: {}, laborSKUs: {}, departments: {} },
      commissionRules: [],
      rails: [],
    });
    expect(compute).toHaveBeenCalled();
    expect((out as any).totals.contractRevenueCents).toBe(12000);
  });

  it('rejects contractMonths <= 0', () => {
    expect(() =>
      computeQuoteTool.inputSchema.parse({
        contractMonths: 0,
        tabs: [],
        products: { saas: {}, laborSKUs: {}, departments: {} },
        commissionRules: [],
        rails: [],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/mcp/tools/reads.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `lib/mcp/tools/reads.ts`. Note: the engine's `ComputeRequest` type uses `decimal.js`; the MCP boundary receives plain numbers + strings, which we parse into `Decimal`. We only validate structure here; the engine already validates semantics.

```typescript
import { z } from 'zod';
import Decimal from 'decimal.js';
import { compute } from '@/lib/engine';
import type { ToolDefinition } from '@/lib/mcp/server';
import type { ComputeRequest, TabInput } from '@/lib/engine/types';

// Helpers: Zod passes JSON-compatible input; engine wants Decimal. Convert at the boundary.
const decimalFromString = z
  .union([z.string(), z.number()])
  .transform((v) => new Decimal(v));

const saasTabSchema = z.object({
  kind: z.literal('SAAS_USAGE'),
  productId: z.string(),
  seatCount: z.number().int().nonnegative(),
  personaMix: z.array(z.object({ personaId: z.string(), pct: z.number() })),
  discountOverridePct: decimalFromString.optional(),
});

const packagedLaborTabSchema = z.object({
  kind: z.literal('PACKAGED_LABOR'),
  productId: z.string(),
  lineItems: z.array(
    z.object({
      skuId: z.string().optional(),
      customDescription: z.string().optional(),
      qty: decimalFromString,
      unit: z.string(),
      costPerUnitUsd: decimalFromString,
      revenuePerUnitUsd: decimalFromString,
    }),
  ),
});

const customLaborTabSchema = z.object({
  kind: z.literal('CUSTOM_LABOR'),
  productId: z.string(),
  lineItems: z.array(
    z.object({
      departmentId: z.string().optional(),
      customDescription: z.string().optional(),
      hours: decimalFromString,
    }),
  ),
});

const tabInputSchema = z.discriminatedUnion('kind', [
  saasTabSchema,
  packagedLaborTabSchema,
  customLaborTabSchema,
]);

const vendorRateSchema = z.object({
  id: z.string(),
  name: z.string(),
  unitLabel: z.string(),
  rateUsd: decimalFromString,
});

const baseUsageSchema = z.object({ vendorRateId: z.string(), usagePerMonth: decimalFromString });

const personaSnapSchema = z.object({
  id: z.string(),
  name: z.string(),
  multiplier: decimalFromString,
});

const fixedCostSchema = z.object({ id: z.string(), name: z.string(), monthlyUsd: decimalFromString });

const volumeTierSchema = z.object({ minSeats: z.number().int(), discountPct: decimalFromString });
const contractModifierSchema = z.object({
  minMonths: z.number().int(),
  additionalDiscountPct: decimalFromString,
});

const saasProductSchema = z.object({
  kind: z.literal('SAAS_USAGE'),
  productId: z.string(),
  vendorRates: z.array(vendorRateSchema),
  baseUsage: z.array(baseUsageSchema),
  otherVariableUsdPerUserPerMonth: decimalFromString,
  personas: z.array(personaSnapSchema),
  fixedCosts: z.array(fixedCostSchema),
  activeUsersAtScale: z.number().int().nonnegative(),
  listPriceUsdPerSeatPerMonth: decimalFromString,
  volumeTiers: z.array(volumeTierSchema),
  contractModifiers: z.array(contractModifierSchema),
});

const laborSkuSnapSchema = z.object({
  id: z.string(),
  productId: z.string(),
  name: z.string(),
  unit: z.enum(['PER_USER', 'PER_SESSION', 'PER_DAY', 'FIXED']),
  costPerUnitUsd: decimalFromString,
  defaultRevenuePerUnitUsd: decimalFromString,
});

const departmentSnapSchema = z.object({
  id: z.string(),
  name: z.string(),
  loadedRatePerHourUsd: decimalFromString,
  billRatePerHourUsd: decimalFromString,
});

const commissionTierSchema = z.object({
  thresholdFromUsd: decimalFromString,
  ratePct: decimalFromString,
});

const commissionRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopeType: z.enum(['ALL', 'PRODUCT', 'DEPARTMENT']),
  scopeProductId: z.string().optional(),
  scopeDepartmentId: z.string().optional(),
  baseMetric: z.enum(['REVENUE', 'CONTRIBUTION_MARGIN', 'TAB_REVENUE', 'TAB_MARGIN']),
  tiers: z.array(commissionTierSchema),
  recipientEmployeeId: z.string().optional(),
});

const railSchema = z.object({
  id: z.string(),
  productId: z.string(),
  kind: z.enum(['MIN_MARGIN_PCT', 'MAX_DISCOUNT_PCT', 'MIN_SEAT_PRICE', 'MIN_CONTRACT_MONTHS']),
  marginBasis: z.enum(['CONTRIBUTION', 'NET']),
  softThreshold: decimalFromString,
  hardThreshold: decimalFromString,
});

const computeQuoteSchema = z.object({
  contractMonths: z.number().int().positive(),
  tabs: z.array(tabInputSchema),
  products: z.object({
    saas: z.record(z.string(), saasProductSchema),
    laborSKUs: z.record(z.string(), laborSkuSnapSchema),
    departments: z.record(z.string(), departmentSnapSchema),
  }),
  commissionRules: z.array(commissionRuleSchema),
  rails: z.array(railSchema),
});

export const computeQuoteTool: ToolDefinition<z.infer<typeof computeQuoteSchema>, unknown> = {
  name: 'compute_quote',
  description:
    'Pure computation. Given a full ComputeRequest (products, tabs, rails, commission rules), returns contract/monthly totals and any rail warnings. No database write. Use for "what would this scenario look like" questions without persisting anything.',
  inputSchema: computeQuoteSchema,
  requiresAdmin: false,
  handler: async (_ctx, input) => {
    // Zod has already coerced strings to Decimals via `decimalFromString`.
    return compute(input as unknown as ComputeRequest);
  },
};

export const readTools: ToolDefinition[] = [computeQuoteTool];
```

- [ ] **Step 4: Register in the route**

Edit `app/api/mcp/route.ts`:

```typescript
import { readTools } from '@/lib/mcp/tools/reads';
// ...
const tools: Parameters<typeof createMcpServer>[0] = [...readTools];
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run lib/mcp/tools/reads.test.ts app/api/mcp/route.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/mcp/tools/reads.ts lib/mcp/tools/reads.test.ts app/api/mcp/route.ts
git commit -m "feat(mcp): compute_quote tool (pure, no DB write)"
```

---

## Task 5.0-L: Product + bundle read tools

**Files:**
- Modify: `lib/mcp/tools/reads.ts`
- Modify: `lib/mcp/tools/reads.test.ts`

Adds 4 tools: `list_products`, `get_product`, `list_bundles`, `get_bundle`. Each is a thin wrapper over existing services in `lib/services/product.ts` and `lib/services/bundle.ts`.

- [ ] **Step 1: Add tests**

Append to `lib/mcp/tools/reads.test.ts`:

```typescript
vi.mock('@/lib/services/product', () => ({
  listProducts: vi.fn(),
  getProductById: vi.fn(),
}));
vi.mock('@/lib/services/bundle', () => ({
  listBundles: vi.fn(),
  getBundleById: vi.fn(),
}));

import {
  listProductsTool,
  getProductTool,
  listBundlesTool,
  getBundleTool,
} from './reads';
import { listProducts, getProductById } from '@/lib/services/product';
import { listBundles, getBundleById } from '@/lib/services/bundle';
import { NotFoundError } from '@/lib/utils/errors';

describe('list_products tool', () => {
  it('returns sanitized product list (id, name, kind, isArchived)', async () => {
    vi.mocked(listProducts).mockResolvedValue([
      { id: 'p1', name: 'Ninja Notes', kind: 'SAAS_USAGE', isArchived: false } as any,
    ]);
    const out = await listProductsTool.handler(ctx, {});
    expect(out).toEqual([{ id: 'p1', name: 'Ninja Notes', kind: 'SAAS_USAGE', isArchived: false }]);
  });
});

describe('get_product tool', () => {
  it('passes id to service', async () => {
    vi.mocked(getProductById).mockResolvedValue({ id: 'p1', name: 'X' } as any);
    await getProductTool.handler(ctx, { id: 'p1' });
    expect(getProductById).toHaveBeenCalledWith('p1');
  });
  it('NotFoundError propagates', async () => {
    vi.mocked(getProductById).mockRejectedValue(new NotFoundError('Product', 'zzz'));
    await expect(getProductTool.handler(ctx, { id: 'zzz' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('list_bundles / get_bundle', () => {
  it('list_bundles returns array from service', async () => {
    vi.mocked(listBundles).mockResolvedValue([]);
    expect(await listBundlesTool.handler(ctx, {})).toEqual([]);
  });
  it('get_bundle forwards id', async () => {
    vi.mocked(getBundleById).mockResolvedValue({ id: 'b1' } as any);
    await getBundleTool.handler(ctx, { id: 'b1' });
    expect(getBundleById).toHaveBeenCalledWith('b1');
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/mcp/tools/reads.test.ts`
Expected: several "export not found" errors.

- [ ] **Step 3: Implement tools**

Append to `lib/mcp/tools/reads.ts`:

```typescript
import { listProducts, getProductById } from '@/lib/services/product';
import { listBundles, getBundleById } from '@/lib/services/bundle';

export const listProductsTool: ToolDefinition<{}, unknown> = {
  name: 'list_products',
  description:
    'Lists every product with id, name, kind (SAAS_USAGE | PACKAGED_LABOR | CUSTOM_LABOR), and archive flag. Use as the starting point for discovering what pricing is available.',
  inputSchema: z.object({}).strict(),
  requiresAdmin: false,
  handler: async () => {
    const products = await listProducts();
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      isArchived: p.isArchived,
    }));
  },
};

export const getProductTool: ToolDefinition<{ id: string }, unknown> = {
  name: 'get_product',
  description:
    'Full product snapshot including rate card, personas, list price, volume tiers, contract modifiers, and rails. Returns the same shape the engine consumes. Admin callers see additional fields (loaded rates). Throws if the id does not exist.',
  inputSchema: z.object({ id: z.string() }).strict(),
  requiresAdmin: false,
  handler: async (_ctx, { id }) => getProductById(id),
};

export const listBundlesTool: ToolDefinition<{}, unknown> = {
  name: 'list_bundles',
  description: 'Lists bundles with item counts. Use before apply_bundle_to_scenario to see what is available.',
  inputSchema: z.object({}).strict(),
  requiresAdmin: false,
  handler: async () => listBundles(),
};

export const getBundleTool: ToolDefinition<{ id: string }, unknown> = {
  name: 'get_bundle',
  description: 'Bundle detail including all items (SaaS configs, labor SKU references, department/hours references). Throws if not found.',
  inputSchema: z.object({ id: z.string() }).strict(),
  requiresAdmin: false,
  handler: async (_ctx, { id }) => getBundleById(id),
};

// Replace the existing `readTools` export at the bottom of the file:
// export const readTools: ToolDefinition[] = [computeQuoteTool, listProductsTool, getProductTool, listBundlesTool, getBundleTool];
```

Update the final `readTools` export to include all five tools.

If `lib/services/product.ts` doesn't expose `listProducts` / `getProductById` with the required shapes, this task must additionally add those exports as thin wrappers around the existing repository calls (they exist already in the Phase 2 work; check `lib/services/product.ts` first and only extend if a function is missing).

- [ ] **Step 4: Run — pass**

Run: `npx vitest run lib/mcp/tools/reads.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/tools/reads.ts lib/mcp/tools/reads.test.ts
git commit -m "feat(mcp): list_products / get_product / list_bundles / get_bundle"
```

---

## Task 5.0-M: Scenario read tools

**Files:**
- Modify: `lib/mcp/tools/reads.ts`
- Modify: `lib/mcp/tools/reads.test.ts`

Adds 2 tools: `list_scenarios` and `get_scenario`. Both role-scoped — sales sees own; admin sees all.

- [ ] **Step 1: Add tests**

Append to `lib/mcp/tools/reads.test.ts`:

```typescript
vi.mock('@/lib/services/scenario', () => ({
  listScenariosForUser: vi.fn(),
  getScenarioById: vi.fn(),
}));

import { listScenariosTool, getScenarioTool } from './reads';
import { listScenariosForUser, getScenarioById } from '@/lib/services/scenario';

const salesCtx: McpContext = {
  user: { id: 'u2', email: 's@b', name: null, role: 'SALES' },
  token: { id: 't2', label: 'x', ownerUserId: 'u2' },
};

describe('list_scenarios tool', () => {
  it('sales sees only own', async () => {
    vi.mocked(listScenariosForUser).mockResolvedValue([]);
    await listScenariosTool.handler(salesCtx, {});
    expect(listScenariosForUser).toHaveBeenCalledWith({ role: 'SALES', userId: 'u2' });
  });

  it('admin sees all', async () => {
    vi.mocked(listScenariosForUser).mockResolvedValue([]);
    await listScenariosTool.handler(ctx, {});
    expect(listScenariosForUser).toHaveBeenCalledWith({ role: 'ADMIN', userId: 'u1' });
  });

  it('filters are optional and forwarded', async () => {
    vi.mocked(listScenariosForUser).mockResolvedValue([]);
    await listScenariosTool.handler(ctx, { status: 'DRAFT', customer: 'Acme' });
    expect(listScenariosForUser).toHaveBeenCalledWith({
      role: 'ADMIN',
      userId: 'u1',
      status: 'DRAFT',
      customer: 'Acme',
    });
  });
});

describe('get_scenario tool', () => {
  it('sales gets own scenario', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    const out = await getScenarioTool.handler(salesCtx, { id: 's1' });
    expect((out as any).id).toBe('s1');
  });

  it('sales cannot get another user\'s scenario → NotFoundError', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'other' } as any);
    await expect(getScenarioTool.handler(salesCtx, { id: 's1' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('admin can get any scenario', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'somebody' } as any);
    const out = await getScenarioTool.handler(ctx, { id: 's1' });
    expect((out as any).id).toBe('s1');
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/mcp/tools/reads.test.ts`
Expected: export-not-found errors.

- [ ] **Step 3: Implement**

Append to `lib/mcp/tools/reads.ts`:

```typescript
import { listScenariosForUser, getScenarioById } from '@/lib/services/scenario';
import { NotFoundError } from '@/lib/utils/errors';

const scenarioListInputSchema = z
  .object({
    status: z.enum(['DRAFT', 'IN_REVIEW', 'SENT', 'WON', 'LOST', 'ARCHIVED']).optional(),
    customer: z.string().optional(),
  })
  .strict();

export const listScenariosTool: ToolDefinition<
  z.infer<typeof scenarioListInputSchema>,
  unknown
> = {
  name: 'list_scenarios',
  description:
    'Lists scenarios. Sales role sees only their own; admin sees everyone. Supports optional filters: status, customer (substring match).',
  inputSchema: scenarioListInputSchema,
  requiresAdmin: false,
  handler: async (ctx, input) =>
    listScenariosForUser({
      role: ctx.user.role,
      userId: ctx.user.id,
      ...(input.status != null && { status: input.status }),
      ...(input.customer != null && { customer: input.customer }),
    }),
};

export const getScenarioTool: ToolDefinition<{ id: string }, unknown> = {
  name: 'get_scenario',
  description:
    'Full scenario with all SaaS configs, labor lines, and quote versions. Sales callers receive 404 for scenarios they do not own, to avoid leaking existence.',
  inputSchema: z.object({ id: z.string() }).strict(),
  requiresAdmin: false,
  handler: async (ctx, { id }) => {
    const scenario = await getScenarioById(id);
    if (ctx.user.role === 'SALES' && (scenario as any).ownerId !== ctx.user.id) {
      throw new NotFoundError('Scenario', id);
    }
    return scenario;
  },
};
```

Update `readTools` export to include both.

If `lib/services/scenario.ts` lacks `listScenariosForUser` with role + filters, add that function as a thin repository wrapper in the same commit.

- [ ] **Step 4: Run — pass**

Run: `npx vitest run lib/mcp/tools/reads.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/tools/reads.ts lib/mcp/tools/reads.test.ts lib/services/scenario.ts
git commit -m "feat(mcp): list_scenarios / get_scenario (role-scoped)"
```

---

## Task 5.0-N: Quote read tools

**Files:**
- Modify: `lib/mcp/tools/reads.ts`
- Modify: `lib/mcp/tools/reads.test.ts`

Adds 2 tools: `list_quotes_for_scenario` and `get_quote` (with opt-in PDF bytes).

- [ ] **Step 1: Add tests**

Append to `lib/mcp/tools/reads.test.ts`:

```typescript
vi.mock('@/lib/db/repositories/quote', () => ({
  QuoteRepository: vi.fn(function (this: any) {
    this.listByScenario = vi.fn(async () => []);
    this.findById = vi.fn();
    return this;
  }),
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from('PDF-BYTES')),
}));

import { listQuotesForScenarioTool, getQuoteTool } from './reads';
import { QuoteRepository } from '@/lib/db/repositories/quote';

describe('list_quotes_for_scenario', () => {
  it('forwards scenarioId to repo', async () => {
    const repoInstance = new (QuoteRepository as any)();
    (QuoteRepository as any).mockImplementation(() => repoInstance);
    await listQuotesForScenarioTool.handler(ctx, { scenarioId: 's1' });
    expect(repoInstance.listByScenario).toHaveBeenCalledWith('s1');
  });
});

describe('get_quote', () => {
  const quote = {
    id: 'q1',
    version: 1,
    scenario: { ownerId: 'u1' },
    pdfUrl: '/tmp/customer.pdf',
    internalPdfUrl: '/tmp/internal.pdf',
    totals: {},
  };

  it('returns metadata by default (no bytes)', async () => {
    const repoInstance = new (QuoteRepository as any)();
    repoInstance.findById.mockResolvedValue(quote);
    (QuoteRepository as any).mockImplementation(() => repoInstance);
    const out = await getQuoteTool.handler(ctx, { id: 'q1' });
    expect((out as any).customerPdfBase64).toBeUndefined();
    expect((out as any).internalPdfBase64).toBeUndefined();
    expect((out as any).downloadUrl).toBe('/api/quotes/q1/download');
  });

  it('returns customerPdfBase64 when include_pdf_bytes:true', async () => {
    const repoInstance = new (QuoteRepository as any)();
    repoInstance.findById.mockResolvedValue(quote);
    (QuoteRepository as any).mockImplementation(() => repoInstance);
    const out = await getQuoteTool.handler(ctx, { id: 'q1', include_pdf_bytes: true });
    expect((out as any).customerPdfBase64).toBe(Buffer.from('PDF-BYTES').toString('base64'));
    expect((out as any).internalPdfBase64).toBe(Buffer.from('PDF-BYTES').toString('base64'));
  });

  it('internalPdfBase64 withheld for sales caller even if include_pdf_bytes:true', async () => {
    const repoInstance = new (QuoteRepository as any)();
    repoInstance.findById.mockResolvedValue(quote);
    (QuoteRepository as any).mockImplementation(() => repoInstance);
    const salesQuote = { ...quote, scenario: { ownerId: salesCtx.user.id } };
    repoInstance.findById.mockResolvedValue(salesQuote);
    const out = await getQuoteTool.handler(salesCtx, { id: 'q1', include_pdf_bytes: true });
    expect((out as any).customerPdfBase64).toBeDefined();
    expect((out as any).internalPdfBase64).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/mcp/tools/reads.test.ts`
Expected: export-not-found.

- [ ] **Step 3: Implement**

Append to `lib/mcp/tools/reads.ts`:

```typescript
import { readFile } from 'node:fs/promises';
import { QuoteRepository } from '@/lib/db/repositories/quote';
import { prisma } from '@/lib/db/client';

export const listQuotesForScenarioTool: ToolDefinition<{ scenarioId: string }, unknown> = {
  name: 'list_quotes_for_scenario',
  description: 'All quote versions for a scenario, ordered version desc.',
  inputSchema: z.object({ scenarioId: z.string() }).strict(),
  requiresAdmin: false,
  handler: async (ctx, { scenarioId }) => {
    // Ownership check: if sales, reject if scenario not owned by caller.
    if (ctx.user.role === 'SALES') {
      const scenario = await getScenarioById(scenarioId);
      if ((scenario as any).ownerId !== ctx.user.id) {
        throw new NotFoundError('Scenario', scenarioId);
      }
    }
    const repo = new QuoteRepository(prisma);
    return repo.listByScenario(scenarioId);
  },
};

const getQuoteInputSchema = z
  .object({ id: z.string(), include_pdf_bytes: z.boolean().optional() })
  .strict();

export const getQuoteTool: ToolDefinition<z.infer<typeof getQuoteInputSchema>, unknown> = {
  name: 'get_quote',
  description:
    'Quote detail including frozen totals. By default returns metadata only; pass include_pdf_bytes=true to inline the customer PDF (admin callers also get the internal PDF). Non-owner sales callers receive 404.',
  inputSchema: getQuoteInputSchema,
  requiresAdmin: false,
  handler: async (ctx, input) => {
    const repo = new QuoteRepository(prisma);
    const quote = await repo.findById(input.id);
    if (!quote) throw new NotFoundError('Quote', input.id);
    if (ctx.user.role === 'SALES' && (quote as any).scenario.ownerId !== ctx.user.id) {
      throw new NotFoundError('Quote', input.id);
    }

    const base = {
      id: quote.id,
      version: quote.version,
      generatedAt: quote.generatedAt,
      totals: quote.totals,
      downloadUrl: `/api/quotes/${quote.id}/download`,
    };

    if (!input.include_pdf_bytes) return base;

    const customerPdf = await readFile(quote.pdfUrl);
    const withCustomer = { ...base, customerPdfBase64: customerPdf.toString('base64') };

    if (ctx.user.role === 'ADMIN' && quote.internalPdfUrl) {
      const internalPdf = await readFile(quote.internalPdfUrl);
      return { ...withCustomer, internalPdfBase64: internalPdf.toString('base64') };
    }
    return withCustomer;
  },
};
```

Update the `readTools` export to include both.

- [ ] **Step 4: Run — pass**

Run: `npx vitest run lib/mcp/tools/reads.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/tools/reads.ts lib/mcp/tools/reads.test.ts
git commit -m "feat(mcp): list_quotes_for_scenario / get_quote (opt-in PDF bytes)"
```

---

## Task 5.0-O: Admin-only read tools

**Files:**
- Create: `lib/mcp/tools/adminReads.ts`
- Create: `lib/mcp/tools/adminReads.test.ts`
- Modify: `app/api/mcp/route.ts`

5 admin tools: `list_employees`, `get_employee`, `list_departments`, `list_burdens`, `list_commission_rules`, `get_commission_rule`, `list_api_tokens`.

Wait — that's 7. The design spec counts `list_employees/get_employee` as one line-item but they are two tools; same for commission rules. The true count is 7. The Phase 5.0 overview said "5 admin-only read tools" compressing pairs; we implement all 7 individual tools.

- [ ] **Step 1: Write the failing test**

Create `lib/mcp/tools/adminReads.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/services/employee', () => ({
  listEmployees: vi.fn(async () => []),
  getEmployeeById: vi.fn(async () => ({ id: 'e1' })),
}));
vi.mock('@/lib/services/department', () => ({
  listDepartmentsWithLoadedRate: vi.fn(async () => []),
}));
vi.mock('@/lib/services/burden', () => ({
  listBurdens: vi.fn(async () => []),
}));
vi.mock('@/lib/services/commissionRule', () => ({
  listCommissionRules: vi.fn(async () => []),
  getCommissionRuleById: vi.fn(async () => ({ id: 'r1' })),
}));
vi.mock('@/lib/services/apiToken', () => ({
  listAllApiTokens: vi.fn(async () => []),
}));

import {
  listEmployeesTool,
  getEmployeeTool,
  listDepartmentsTool,
  listBurdensTool,
  listCommissionRulesTool,
  getCommissionRuleTool,
  listApiTokensTool,
} from './adminReads';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};

describe('admin-only read tools all have requiresAdmin=true', () => {
  it.each([
    listEmployeesTool,
    getEmployeeTool,
    listDepartmentsTool,
    listBurdensTool,
    listCommissionRulesTool,
    getCommissionRuleTool,
    listApiTokensTool,
  ])('%s', (tool) => {
    expect(tool.requiresAdmin).toBe(true);
  });
});

describe('admin-only read tools call their services', () => {
  it('list_employees', async () => {
    await listEmployeesTool.handler(adminCtx, {});
    const { listEmployees } = await import('@/lib/services/employee');
    expect(listEmployees).toHaveBeenCalled();
  });

  it('get_employee forwards id', async () => {
    await getEmployeeTool.handler(adminCtx, { id: 'e1' });
    const { getEmployeeById } = await import('@/lib/services/employee');
    expect(getEmployeeById).toHaveBeenCalledWith('e1');
  });

  it('list_departments uses loaded-rate variant', async () => {
    await listDepartmentsTool.handler(adminCtx, {});
    const { listDepartmentsWithLoadedRate } = await import('@/lib/services/department');
    expect(listDepartmentsWithLoadedRate).toHaveBeenCalled();
  });

  it('list_commission_rules', async () => {
    await listCommissionRulesTool.handler(adminCtx, {});
    const { listCommissionRules } = await import('@/lib/services/commissionRule');
    expect(listCommissionRules).toHaveBeenCalled();
  });

  it('list_api_tokens', async () => {
    await listApiTokensTool.handler(adminCtx, {});
    const { listAllApiTokens } = await import('@/lib/services/apiToken');
    expect(listAllApiTokens).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/mcp/tools/adminReads.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `lib/mcp/tools/adminReads.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '@/lib/mcp/server';
import { listEmployees, getEmployeeById } from '@/lib/services/employee';
import { listDepartmentsWithLoadedRate } from '@/lib/services/department';
import { listBurdens } from '@/lib/services/burden';
import { listCommissionRules, getCommissionRuleById } from '@/lib/services/commissionRule';
import { listAllApiTokens } from '@/lib/services/apiToken';

const empty = z.object({}).strict();

export const listEmployeesTool: ToolDefinition = {
  name: 'list_employees',
  description: 'Admin only. Lists all employees with compensation, department, and active flag.',
  inputSchema: empty,
  requiresAdmin: true,
  handler: async () => listEmployees(),
};

export const getEmployeeTool: ToolDefinition<{ id: string }, unknown> = {
  name: 'get_employee',
  description: 'Admin only. Full employee row.',
  inputSchema: z.object({ id: z.string() }).strict(),
  requiresAdmin: true,
  handler: async (_ctx, { id }) => getEmployeeById(id),
};

export const listDepartmentsTool: ToolDefinition = {
  name: 'list_departments',
  description: 'Admin only. Departments with computed loaded hourly rate + admin-set bill rate.',
  inputSchema: empty,
  requiresAdmin: true,
  handler: async () => listDepartmentsWithLoadedRate(),
};

export const listBurdensTool: ToolDefinition = {
  name: 'list_burdens',
  description: 'Admin only. All burden rates (FICA/FUTA/SUTA/etc.), caps, and scope.',
  inputSchema: empty,
  requiresAdmin: true,
  handler: async () => listBurdens(),
};

export const listCommissionRulesTool: ToolDefinition = {
  name: 'list_commission_rules',
  description: 'Admin only. Commission rules with tiers and scope.',
  inputSchema: empty,
  requiresAdmin: true,
  handler: async () => listCommissionRules(),
};

export const getCommissionRuleTool: ToolDefinition<{ id: string }, unknown> = {
  name: 'get_commission_rule',
  description: 'Admin only. Commission rule detail with tier breakdown.',
  inputSchema: z.object({ id: z.string() }).strict(),
  requiresAdmin: true,
  handler: async (_ctx, { id }) => getCommissionRuleById(id),
};

export const listApiTokensTool: ToolDefinition = {
  name: 'list_api_tokens',
  description: 'Admin only. All non-revoked API tokens across the org. Use for audit/kill-switch.',
  inputSchema: empty,
  requiresAdmin: true,
  handler: async () => listAllApiTokens(),
};

export const adminReadTools: ToolDefinition[] = [
  listEmployeesTool,
  getEmployeeTool,
  listDepartmentsTool,
  listBurdensTool,
  listCommissionRulesTool,
  getCommissionRuleTool,
  listApiTokensTool,
];
```

If any of the service functions referenced (`listDepartmentsWithLoadedRate`, `getCommissionRuleById`, etc.) don't exist yet, implement them in the corresponding `lib/services/*.ts` as thin wrappers over the existing repositories in the same commit. Do NOT change existing function shapes.

- [ ] **Step 4: Register in the route**

Edit `app/api/mcp/route.ts`:

```typescript
import { adminReadTools } from '@/lib/mcp/tools/adminReads';
// ...
const tools: Parameters<typeof createMcpServer>[0] = [...readTools, ...adminReadTools];
```

- [ ] **Step 5: Run — pass**

Run: `npx vitest run lib/mcp/tools/adminReads.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/mcp/tools/adminReads.ts lib/mcp/tools/adminReads.test.ts app/api/mcp/route.ts lib/services/
git commit -m "feat(mcp): admin-only read tools (employees, departments, burdens, commissions, tokens)"
```

---

## Task 5.0-P: MCP protocol conformance test

**Files:**
- Create: `app/api/mcp/protocol.test.ts`

Proves we're emitting valid MCP by connecting with `@modelcontextprotocol/sdk`'s client.

- [ ] **Step 1: Write the test**

Create `app/api/mcp/protocol.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/mcp/auth', () => ({
  authenticateMcpRequest: vi.fn().mockResolvedValue({
    user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
    token: { id: 't1', label: 'x', ownerUserId: 'u1' },
  }),
}));
vi.mock('@/lib/services/product', () => ({
  listProducts: vi.fn(async () => [
    { id: 'p1', name: 'Ninja Notes', kind: 'SAAS_USAGE', isArchived: false },
  ]),
}));

import { POST } from './route';

function rpc(id: number, method: string, params: unknown = {}) {
  return new Request('http://x/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer np_live_x' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
}

describe('MCP protocol conformance', () => {
  it('initialize returns protocolVersion and tools capability', async () => {
    const res = await POST(rpc(1, 'initialize', {}));
    const body = await res.json();
    expect(body.result.protocolVersion).toBeDefined();
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it('tools/list returns expected read tools for admin', async () => {
    const res = await POST(rpc(2, 'tools/list'));
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('list_products');
    expect(names).toContain('compute_quote');
    expect(names).toContain('list_api_tokens');
  });

  it('tools/call list_products returns the mocked product list wrapped in content[]', async () => {
    const res = await POST(rpc(3, 'tools/call', { name: 'list_products', arguments: {} }));
    const body = await res.json();
    expect(body.result.content[0].type).toBe('json');
    expect(body.result.content[0].json[0].name).toBe('Ninja Notes');
  });

  it('tools/call with unknown name returns Forbidden error (do not leak existence)', async () => {
    const res = await POST(rpc(4, 'tools/call', { name: 'nope', arguments: {} }));
    const body = await res.json();
    expect(body.error.code).toBe(-32002);
  });
});
```

- [ ] **Step 2: Run — pass**

Run: `npx vitest run app/api/mcp/protocol.test.ts`
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/mcp/protocol.test.ts
git commit -m "test(mcp): protocol conformance against POST /api/mcp"
```

---

## Task 5.0-Q: `/settings/tokens` user self-serve UI

**Files:**
- Create: `app/settings/tokens/page.tsx`
- Create: `app/settings/tokens/actions.ts`
- Create: `app/settings/tokens/NewTokenDialog.tsx`
- Create: `app/settings/tokens/RevokeButton.tsx`
- Modify: `components/TopNav.tsx` (add "Tokens" link)

- [ ] **Step 1: Server actions**

Create `app/settings/tokens/actions.ts`:

```typescript
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
```

- [ ] **Step 2: Page**

Create `app/settings/tokens/page.tsx`:

```typescript
import { requireAuth } from '@/lib/auth/session';
import { listMyTokensAction } from './actions';
import NewTokenDialog from './NewTokenDialog';
import RevokeButton from './RevokeButton';

export const dynamic = 'force-dynamic';

export default async function SettingsTokensPage() {
  await requireAuth();
  const tokens = await listMyTokensAction();

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">API tokens</h1>
          <p className="text-sm text-muted-foreground">
            Issue tokens for Cowork, Claude Code, or any MCP client. Raw token is shown once at creation.
          </p>
        </div>
        <NewTokenDialog />
      </div>

      {tokens.length === 0 ? (
        <p className="text-sm">No tokens yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left border-b">
            <tr>
              <th className="py-2">Label</th>
              <th>Prefix</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Expires</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => {
              const status = t.revokedAt
                ? 'revoked'
                : t.expiresAt && t.expiresAt.getTime() < Date.now()
                  ? 'expired'
                  : 'active';
              return (
                <tr key={t.id} className="border-b">
                  <td className="py-2">{t.label}</td>
                  <td className="font-mono text-xs">{t.tokenPrefix}…</td>
                  <td>{t.createdAt.toISOString().slice(0, 10)}</td>
                  <td>{t.lastUsedAt?.toISOString().slice(0, 10) ?? '—'}</td>
                  <td>{t.expiresAt?.toISOString().slice(0, 10) ?? 'never'}</td>
                  <td>{status}</td>
                  <td>{status === 'active' && <RevokeButton tokenId={t.id} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Dialog component**

Create `app/settings/tokens/NewTokenDialog.tsx`:

```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { issueMyTokenAction } from './actions';

export default function NewTokenDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      const { rawToken } = await issueMyTokenAction(formData);
      setIssued(rawToken);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPending(false);
    }
  }

  if (issued) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
        <div className="bg-white dark:bg-gray-900 rounded p-6 max-w-lg space-y-3">
          <h2 className="text-lg font-semibold">Copy this token now</h2>
          <p className="text-sm">It won't be shown again. Save it somewhere safe.</p>
          <code className="block p-3 text-xs bg-gray-100 dark:bg-gray-800 break-all font-mono">{issued}</code>
          <Button
            variant="destructive"
            onClick={() => {
              setIssued(null);
              setOpen(false);
            }}
          >
            I've saved it — close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>New token</Button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
          <form
            action={submit}
            className="bg-white dark:bg-gray-900 rounded p-6 max-w-md space-y-3"
          >
            <h2 className="text-lg font-semibold">Issue API token</h2>
            <div>
              <label className="block text-sm">Label</label>
              <input name="label" required className="w-full border rounded px-2 py-1" placeholder="e.g. Cowork" />
            </div>
            <div>
              <label className="block text-sm">Expires at (optional)</label>
              <input name="expiresAt" type="date" className="w-full border rounded px-2 py-1" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Issuing…' : 'Issue'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Revoke button**

Create `app/settings/tokens/RevokeButton.tsx`:

```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { revokeMyTokenAction } from './actions';

export default function RevokeButton({ tokenId }: { tokenId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <form
      action={async (fd) => {
        setPending(true);
        try {
          await revokeMyTokenAction(fd);
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      <input type="hidden" name="tokenId" value={tokenId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        Revoke
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Add nav link**

Edit `components/TopNav.tsx` to include a "Tokens" link under the signed-in user menu (match whatever pattern it uses for existing links; if there's no user menu, append a top-level link).

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add app/settings/tokens/ components/TopNav.tsx
git commit -m "feat(mcp): /settings/tokens self-serve UI"
```

---

## Task 5.0-R: `/admin/api-tokens` admin cross-user UI

**Files:**
- Create: `app/admin/api-tokens/page.tsx`
- Create: `app/admin/api-tokens/actions.ts`
- Create: `app/admin/api-tokens/TokenDrawer.tsx`

- [ ] **Step 1: Server actions**

Create `app/admin/api-tokens/actions.ts`:

```typescript
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
```

- [ ] **Step 2: Page**

Create `app/admin/api-tokens/page.tsx`:

```typescript
import { requireAdmin } from '@/lib/auth/session';
import { listAllTokensAction } from './actions';
import TokenDrawer from './TokenDrawer';

export const dynamic = 'force-dynamic';

export default async function AdminTokensPage() {
  await requireAdmin();
  const tokens = await listAllTokensAction();

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">API tokens (all users)</h1>
        <p className="text-sm text-muted-foreground">
          Revoke any token. Click a row to view its recent audit log.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left border-b">
          <tr>
            <th className="py-2">Owner</th>
            <th>Role</th>
            <th>Label</th>
            <th>Prefix</th>
            <th>Created</th>
            <th>Last used</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => {
            const status = t.revokedAt
              ? 'revoked'
              : t.expiresAt && t.expiresAt.getTime() < Date.now()
                ? 'expired'
                : 'active';
            return (
              <tr key={t.id} className="border-b">
                <td className="py-2">{t.owner?.email ?? '—'}</td>
                <td>{t.owner?.role ?? '—'}</td>
                <td>{t.label}</td>
                <td className="font-mono text-xs">{t.tokenPrefix}…</td>
                <td>{t.createdAt.toISOString().slice(0, 10)}</td>
                <td>{t.lastUsedAt?.toISOString().slice(0, 10) ?? '—'}</td>
                <td>{status}</td>
                <td>
                  <TokenDrawer tokenId={t.id} label={t.label} status={status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Drawer**

Create `app/admin/api-tokens/TokenDrawer.tsx`:

```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { listAuditForTokenAction, adminRevokeTokenAction } from './actions';

interface Props {
  tokenId: string;
  label: string;
  status: string;
}

interface AuditRow {
  id: string;
  createdAt: string | Date;
  toolName: string;
  result: 'OK' | 'ERROR';
  errorCode?: string | null;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
}

export default function TokenDrawer({ tokenId, label, status }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  async function openDrawer() {
    setOpen(true);
    const audit = await listAuditForTokenAction(tokenId);
    setRows(audit as AuditRow[]);
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDrawer}>
        View
      </Button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="fixed top-0 right-0 bottom-0 w-[28rem] bg-white dark:bg-gray-900 p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{label}</h2>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Status: {status}</p>
            {status === 'active' && (
              <form
                action={async (fd) => {
                  await adminRevokeTokenAction(fd);
                  setOpen(false);
                  router.refresh();
                }}
                className="mt-3"
              >
                <input type="hidden" name="tokenId" value={tokenId} />
                <Button type="submit" variant="destructive" size="sm">
                  Revoke
                </Button>
              </form>
            )}
            <h3 className="text-md font-semibold mt-4">Last 50 calls</h3>
            {rows === null ? (
              <p className="text-sm">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No write activity yet.</p>
            ) : (
              <ul className="text-xs space-y-1 mt-2">
                {rows.map((r) => (
                  <li key={r.id} className="flex gap-2 border-b py-1">
                    <span className="font-mono">
                      {new Date(r.createdAt).toISOString().slice(0, 19).replace('T', ' ')}
                    </span>
                    <span>{r.toolName}</span>
                    {r.targetEntityType && (
                      <span className="text-muted-foreground">
                        → {r.targetEntityType}:{r.targetEntityId}
                      </span>
                    )}
                    <span
                      className={r.result === 'OK' ? 'text-green-700' : 'text-red-700'}
                    >
                      {r.result}
                      {r.errorCode ? ` (${r.errorCode})` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Add to admin sidebar nav**

Edit `components/admin/Sidebar.tsx` (or whatever file renders the admin side-nav) to add a link: `{ href: '/admin/api-tokens', label: 'API tokens' }`. Match the existing link-entry shape.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/admin/api-tokens/ components/admin/
git commit -m "feat(mcp): /admin/api-tokens cross-user list + audit drawer"
```

---

## File Map Summary

**Created:**
- `lib/mcp/server.ts` + `.test.ts`
- `lib/mcp/auth.ts` + `.test.ts`
- `lib/mcp/context.ts`
- `lib/mcp/errors.ts` + `.test.ts`
- `lib/mcp/tools/reads.ts` + `.test.ts`
- `lib/mcp/tools/adminReads.ts` + `.test.ts`
- `lib/db/repositories/apiToken.ts` + `.test.ts`
- `lib/db/repositories/apiAuditLog.ts` + `.test.ts`
- `lib/services/apiToken.ts` + `.test.ts`
- `lib/services/apiAuditLog.ts` + `.test.ts`
- `app/api/mcp/route.ts` + `.test.ts` + `protocol.test.ts`
- `app/settings/tokens/` (page, actions, dialog, revoke button)
- `app/admin/api-tokens/` (page, actions, drawer)
- `prisma/migrations/<ts>_mcp_tokens_and_audit/migration.sql`

**Modified:**
- `package.json` + `package-lock.json`
- `prisma/schema.prisma`
- `lib/db/repositories/index.ts`
- `lib/services/index.ts`
- `components/TopNav.tsx`
- `components/admin/Sidebar.tsx`

---

## Risks

- **MCP SDK API churn.** The `@modelcontextprotocol/sdk` package has moved fast. If the `Server` class API or `initialize` response shape changes between plan-writing and implementation, the handler in `app/api/mcp/route.ts` may need to adapt. Keeping the handler minimal (hand-rolled JSON-RPC envelope, not auto-wired from SDK primitives) insulates us somewhat.
- **`compute_quote` input size.** Full snapshots can be 20–100 KB per call. Acceptable for HTTP; if we see POST body limits on Railway (default 4 MB), raise the limit explicitly in `next.config.mjs`.
- **Token secrecy in client components.** The dialog returns the raw token via server-action response. That's the only acceptable path — never round-trip through a URL or server-rendered prop. Any regression that leaks rawToken into `window.__NEXT_DATA__` or a cookie should be caught by review.
- **`listDepartmentsWithLoadedRate` may not exist.** If Phase 2.3 didn't expose a service that computes loaded rates for all departments, Task 5.0-O includes adding one. Avoid reimplementing the formula — reuse `computeLoadedHourlyRate` from `lib/services/labor.ts`.
- **Audit log vs read reads.** We explicitly don't log reads, but `list_api_tokens` + `get_quote` (with bytes) could be considered sensitive. Out of scope for 5.0; revisit if compliance ask surfaces.

---

## Milestones

1. **5.0-A–F done** — schema + repos + services ready; no HTTP surface yet.
2. **5.0-G–J done** — `/api/mcp` accepts authed requests, returns an empty tool list. First useful hit-point.
3. **5.0-K done** — `compute_quote` works end-to-end. Cowork can do pricing math.
4. **5.0-L–N done** — all 9 sales+admin reads live.
5. **5.0-O done** — 7 admin reads live (14 total, as the spec required).
6. **5.0-P done** — protocol conformance proven.
7. **5.0-Q + 5.0-R done** — token UIs ship; users can self-serve.

---

## Acceptance Criteria

### Functional

- Admin visits `/settings/tokens`, issues a token, copies it. The token works against `POST /api/mcp` for `tools/list` and for every 14 read tools.
- Sales user's token lists 9 tools (not 14); admin tools return `-32002 Forbidden` when called by the sales token.
- Revoking a token via either UI makes subsequent MCP requests return `-32001 Unauthorized`.
- Demoting an admin user to SALES strips admin-tool access from all their existing tokens on the next request (no token rotation needed).
- `get_quote` with `include_pdf_bytes: true` returns customer PDF bytes for the owner and internal PDF bytes additionally for admin. Sales caller for a scenario they don't own → 404.
- Protocol conformance test passes: our route speaks valid MCP (initialize, tools/list, tools/call, error codes).

### Non-functional

- `npm run test` green (add ~25 new tests across this phase).
- `npm run lint`, `npx tsc --noEmit`, `npm run build` all clean.
- No `fs` or Prisma imports under `lib/mcp/tools/*` — only service imports.
- No regression on Phase 4 features: scenario builder, generate-quote, quote history page all still work.

---

## Phase 5.0 → 5.1 handoff

At the end of Phase 5.0:

- Server infrastructure (auth, routing, error mapping, audit log plumbing) is live but unused for writes.
- Scenario-write tools in Phase 5.1 reuse `lib/mcp/server.ts`'s `ToolDefinition` shape and add `appendAudit` into each handler. No changes to the auth or route layer expected.
