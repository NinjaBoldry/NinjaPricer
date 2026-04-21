# HubSpot Integration — Phase 1 — Catalog Sync Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver end-to-end manual catalog sync between Ninja Pricer and HubSpot — schema, HubSpot client, custom-property provisioning, push, pull, review queue, admin UI, and MCP tools.

**Architecture:** All new code lives in the existing Next.js app. New Prisma models + additive fields on `Product` and `Bundle`. A thin `hubspotFetch` wrapper handles auth, retries, and rate-limit backoff. Catalog sync logic is pure orchestration over existing services. Admin UI adds three pages (status / sync / review queue). MCP tools are thin wrappers over the same service functions the admin UI calls. **No webhooks, no background jobs** — this phase is fully manual per the spec's decision #10.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Prisma 6 + Postgres, Vitest, Zod, `@modelcontextprotocol/sdk`, Shadcn UI, direct `fetch` against HubSpot's v3 CRM REST API (no SDK dependency added).

**Spec reference:** [docs/superpowers/specs/2026-04-21-hubspot-integration-design.md](../specs/2026-04-21-hubspot-integration-design.md)

---

## File Structure

**Created:**
```
lib/hubspot/
  client.ts                          — hubspotFetch wrapper
  client.test.ts
  catalog/
    hash.ts                          — deterministic field hash
    hash.test.ts
    translator.ts                    — pricer Product/Bundle → HubSpot product payload
    translator.test.ts
    push.ts                          — publish_catalog_to_hubspot logic
    push.test.ts
    pull.ts                          — pull_hubspot_changes logic
    pull.test.ts
    reviewQueue.ts                   — resolve review-queue items
    reviewQueue.test.ts
  setup/
    provisionProperties.ts           — idempotent custom property creation
    provisionProperties.test.ts
lib/db/repositories/
  hubspotConfig.ts
  hubspotConfig.test.ts
  hubspotProductMap.ts
  hubspotProductMap.test.ts
  hubspotReviewQueueItem.ts
  hubspotReviewQueueItem.test.ts
lib/services/
  hubspotConfig.ts
  hubspotConfig.test.ts
lib/mcp/tools/
  hubspot.ts                         — 5 catalog MCP tools
  hubspot.test.ts
app/admin/hubspot/
  page.tsx                           — integration status page
  sync/page.tsx                      — push/pull buttons + result panes
  review-queue/page.tsx              — review queue list + resolve buttons
  actions.ts                         — server actions wrapping the MCP/service layer
scripts/
  hubspot-setup.ts                   — one-time custom property provisioning runner
tests/integration/hubspot/
  catalog-roundtrip.test.ts          — integration test against HubSpot dev portal
```

**Modified:**
```
prisma/schema.prisma                 — new models + additive fields
lib/mcp/server.ts                    — registers new tools in default set
.env.example                         — documents HUBSPOT_* env vars
README.md                            — optional: link to setup runbook (deferred)
```

---

## Task 1: Add HubSpot Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1.1: Add new enums at the top of the enum block**

Open `prisma/schema.prisma`. Below the existing enums (after `RailKind`, etc.), add:

```prisma
enum HubSpotProductKind {
  PRODUCT
  BUNDLE
}

enum HubSpotReviewResolution {
  ACCEPT_HUBSPOT
  REJECT
  IGNORE
}
```

- [ ] **Step 1.2: Add `HubSpotConfig` model**

```prisma
model HubSpotConfig {
  id                      String   @id @default(cuid())
  portalId                String   @unique
  enabled                 Boolean  @default(false)
  accessTokenSecretRef    String
  lastPushAt              DateTime?
  lastPullAt              DateTime?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}
```

- [ ] **Step 1.3: Add `HubSpotProductMap` model and relations**

```prisma
model HubSpotProductMap {
  id                String             @id @default(cuid())
  pricerProductId   String?            @unique
  pricerBundleId    String?            @unique
  hubspotProductId  String             @unique
  kind              HubSpotProductKind
  lastSyncedHash    String
  lastSyncedAt      DateTime
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  product           Product?           @relation(fields: [pricerProductId], references: [id], onDelete: Cascade)
  bundle            Bundle?            @relation(fields: [pricerBundleId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 1.4: Add `HubSpotReviewQueueItem` model**

```prisma
model HubSpotReviewQueueItem {
  id                 String                  @id @default(cuid())
  entityType         HubSpotProductKind
  hubspotId          String
  pricerEntityId     String
  changedFields      Json
  changedFieldsHash  String
  detectedAt         DateTime                @default(now())
  resolvedAt         DateTime?
  resolution         HubSpotReviewResolution?
  resolvedByUserId   String?

  @@unique([entityType, hubspotId, changedFieldsHash])
}
```

- [ ] **Step 1.5: Add additive fields on `Product` and `Bundle`**

On the existing `Product` model, add a relation and a denormalized HubSpot ID:

```prisma
  hubspotProductId   String?
  hubspotMap         HubSpotProductMap?
```

On the existing `Bundle` model:

```prisma
  hubspotProductId   String?
  hubspotMap         HubSpotProductMap?
```

- [ ] **Step 1.6: Generate migration**

Run: `npx prisma migrate dev --name hubspot_phase_1_catalog_foundation --create-only`
Expected: migration file written under `prisma/migrations/<timestamp>_hubspot_phase_1_catalog_foundation/migration.sql`.

Inspect the SQL to confirm:
- Four new enums and three new tables
- Two `ALTER TABLE` statements adding `hubspotProductId` to `Product` and `Bundle`

- [ ] **Step 1.7: Apply migration**

Run: `npx prisma migrate dev` (no name needed; picks up the pending migration).
Expected: migration applied cleanly; `npx prisma generate` runs automatically (postinstall hook equivalent).

- [ ] **Step 1.8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(hubspot): add catalog sync schema (config, product map, review queue)"
```

---

## Task 2: HubSpotConfig repository

**Files:**
- Create: `lib/db/repositories/hubspotConfig.ts`
- Create: `lib/db/repositories/hubspotConfig.test.ts`

- [ ] **Step 2.1: Write failing repository test**

Create `lib/db/repositories/hubspotConfig.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { HubSpotConfigRepository } from './hubspotConfig';

const prisma = new PrismaClient();

describe('HubSpotConfigRepository', () => {
  const repo = new HubSpotConfigRepository(prisma);

  beforeEach(async () => {
    await prisma.hubSpotConfig.deleteMany();
  });

  it('upsert creates a row when none exists', async () => {
    const row = await repo.upsert({
      portalId: 'portal-1',
      enabled: false,
      accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN',
    });
    expect(row.portalId).toBe('portal-1');
    expect(row.enabled).toBe(false);
  });

  it('upsert updates existing row by portalId', async () => {
    await repo.upsert({
      portalId: 'portal-1',
      enabled: false,
      accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN',
    });
    const updated = await repo.upsert({
      portalId: 'portal-1',
      enabled: true,
      accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN',
    });
    expect(updated.enabled).toBe(true);
    const all = await prisma.hubSpotConfig.findMany();
    expect(all.length).toBe(1);
  });

  it('findCurrent returns the singleton row or null', async () => {
    expect(await repo.findCurrent()).toBeNull();
    await repo.upsert({
      portalId: 'portal-1',
      enabled: true,
      accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN',
    });
    const found = await repo.findCurrent();
    expect(found?.portalId).toBe('portal-1');
  });

  it('markPushed updates lastPushAt', async () => {
    const created = await repo.upsert({
      portalId: 'portal-1',
      enabled: true,
      accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN',
    });
    const updated = await repo.markPushed(created.id, new Date('2026-04-21T10:00:00Z'));
    expect(updated.lastPushAt?.toISOString()).toBe('2026-04-21T10:00:00.000Z');
  });
});
```

- [ ] **Step 2.2: Run test — should fail (module missing)**

Run: `npm run test:integration -- lib/db/repositories/hubspotConfig.test.ts`
Expected: FAIL — cannot resolve `./hubspotConfig`.

- [ ] **Step 2.3: Implement repository**

Create `lib/db/repositories/hubspotConfig.ts`:

```ts
import type { PrismaClient, HubSpotConfig } from '@prisma/client';

export class HubSpotConfigRepository {
  constructor(private db: PrismaClient) {}

  async findCurrent(): Promise<HubSpotConfig | null> {
    return this.db.hubSpotConfig.findFirst();
  }

  async upsert(data: {
    portalId: string;
    enabled: boolean;
    accessTokenSecretRef: string;
  }): Promise<HubSpotConfig> {
    return this.db.hubSpotConfig.upsert({
      where: { portalId: data.portalId },
      create: data,
      update: { enabled: data.enabled, accessTokenSecretRef: data.accessTokenSecretRef },
    });
  }

  async markPushed(id: string, at: Date): Promise<HubSpotConfig> {
    return this.db.hubSpotConfig.update({ where: { id }, data: { lastPushAt: at } });
  }

  async markPulled(id: string, at: Date): Promise<HubSpotConfig> {
    return this.db.hubSpotConfig.update({ where: { id }, data: { lastPullAt: at } });
  }
}
```

- [ ] **Step 2.4: Run test — should pass**

Run: `npm run test:integration -- lib/db/repositories/hubspotConfig.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 2.5: Commit**

```bash
git add lib/db/repositories/hubspotConfig.ts lib/db/repositories/hubspotConfig.test.ts
git commit -m "feat(hubspot): HubSpotConfig repository"
```

---

## Task 3: HubSpotProductMap repository

**Files:**
- Create: `lib/db/repositories/hubspotProductMap.ts`
- Create: `lib/db/repositories/hubspotProductMap.test.ts`

- [ ] **Step 3.1: Write failing repository test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient, ProductKind } from '@prisma/client';
import { HubSpotProductMapRepository } from './hubspotProductMap';

const prisma = new PrismaClient();

describe('HubSpotProductMapRepository', () => {
  const repo = new HubSpotProductMapRepository(prisma);

  beforeEach(async () => {
    await prisma.hubSpotProductMap.deleteMany();
    await prisma.bundle.deleteMany();
    await prisma.product.deleteMany();
  });

  it('findByPricerProductId returns null when no mapping exists', async () => {
    expect(await repo.findByPricerProductId('prod-missing')).toBeNull();
  });

  it('createForProduct persists a mapping', async () => {
    const product = await prisma.product.create({
      data: { name: 'Ninja Notes', kind: ProductKind.SAAS, isActive: true },
    });
    const mapping = await repo.createForProduct({
      pricerProductId: product.id,
      hubspotProductId: 'hs-123',
      lastSyncedHash: 'abc',
      lastSyncedAt: new Date('2026-04-21T00:00:00Z'),
    });
    expect(mapping.kind).toBe('PRODUCT');
    expect(mapping.pricerProductId).toBe(product.id);
    expect(mapping.hubspotProductId).toBe('hs-123');
  });

  it('updateHash rewrites lastSyncedHash + lastSyncedAt', async () => {
    const product = await prisma.product.create({
      data: { name: 'Ninja Notes', kind: ProductKind.SAAS, isActive: true },
    });
    const mapping = await repo.createForProduct({
      pricerProductId: product.id,
      hubspotProductId: 'hs-123',
      lastSyncedHash: 'abc',
      lastSyncedAt: new Date('2026-04-21T00:00:00Z'),
    });
    const updated = await repo.updateHash(mapping.id, 'def', new Date('2026-04-22T00:00:00Z'));
    expect(updated.lastSyncedHash).toBe('def');
    expect(updated.lastSyncedAt.toISOString()).toBe('2026-04-22T00:00:00.000Z');
  });

  it('listAll returns all mappings', async () => {
    const product = await prisma.product.create({
      data: { name: 'Ninja Notes', kind: ProductKind.SAAS, isActive: true },
    });
    await repo.createForProduct({
      pricerProductId: product.id,
      hubspotProductId: 'hs-123',
      lastSyncedHash: 'abc',
      lastSyncedAt: new Date(),
    });
    const all = await repo.listAll();
    expect(all.length).toBe(1);
  });
});
```

- [ ] **Step 3.2: Run test — should fail**

Run: `npm run test:integration -- lib/db/repositories/hubspotProductMap.test.ts`
Expected: FAIL.

- [ ] **Step 3.3: Implement repository**

```ts
import type { PrismaClient, HubSpotProductMap } from '@prisma/client';
import { HubSpotProductKind } from '@prisma/client';

export class HubSpotProductMapRepository {
  constructor(private db: PrismaClient) {}

  async findByPricerProductId(productId: string): Promise<HubSpotProductMap | null> {
    return this.db.hubSpotProductMap.findUnique({ where: { pricerProductId: productId } });
  }

  async findByPricerBundleId(bundleId: string): Promise<HubSpotProductMap | null> {
    return this.db.hubSpotProductMap.findUnique({ where: { pricerBundleId: bundleId } });
  }

  async findByHubspotId(hubspotProductId: string): Promise<HubSpotProductMap | null> {
    return this.db.hubSpotProductMap.findUnique({ where: { hubspotProductId } });
  }

  async listAll(): Promise<HubSpotProductMap[]> {
    return this.db.hubSpotProductMap.findMany();
  }

  async createForProduct(data: {
    pricerProductId: string;
    hubspotProductId: string;
    lastSyncedHash: string;
    lastSyncedAt: Date;
  }): Promise<HubSpotProductMap> {
    return this.db.hubSpotProductMap.create({
      data: { ...data, kind: HubSpotProductKind.PRODUCT },
    });
  }

  async createForBundle(data: {
    pricerBundleId: string;
    hubspotProductId: string;
    lastSyncedHash: string;
    lastSyncedAt: Date;
  }): Promise<HubSpotProductMap> {
    return this.db.hubSpotProductMap.create({
      data: { ...data, kind: HubSpotProductKind.BUNDLE },
    });
  }

  async updateHash(id: string, hash: string, at: Date): Promise<HubSpotProductMap> {
    return this.db.hubSpotProductMap.update({
      where: { id },
      data: { lastSyncedHash: hash, lastSyncedAt: at },
    });
  }

  async delete(id: string): Promise<HubSpotProductMap> {
    return this.db.hubSpotProductMap.delete({ where: { id } });
  }
}
```

- [ ] **Step 3.4: Run test — should pass**

Run: `npm run test:integration -- lib/db/repositories/hubspotProductMap.test.ts`
Expected: 4 PASS.

- [ ] **Step 3.5: Commit**

```bash
git add lib/db/repositories/hubspotProductMap.ts lib/db/repositories/hubspotProductMap.test.ts
git commit -m "feat(hubspot): HubSpotProductMap repository"
```

---

## Task 4: HubSpotReviewQueueItem repository

**Files:**
- Create: `lib/db/repositories/hubspotReviewQueueItem.ts`
- Create: `lib/db/repositories/hubspotReviewQueueItem.test.ts`

- [ ] **Step 4.1: Write failing repository test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient, HubSpotProductKind, HubSpotReviewResolution } from '@prisma/client';
import { HubSpotReviewQueueItemRepository } from './hubspotReviewQueueItem';

const prisma = new PrismaClient();

describe('HubSpotReviewQueueItemRepository', () => {
  const repo = new HubSpotReviewQueueItemRepository(prisma);

  beforeEach(async () => {
    await prisma.hubSpotReviewQueueItem.deleteMany();
  });

  it('enqueue is idempotent on (entityType, hubspotId, changedFieldsHash)', async () => {
    const first = await repo.enqueue({
      entityType: HubSpotProductKind.PRODUCT,
      hubspotId: 'hs-1',
      pricerEntityId: 'p-1',
      changedFields: { name: { pricer: 'A', hubspot: 'B' } },
      changedFieldsHash: 'h1',
    });
    const second = await repo.enqueue({
      entityType: HubSpotProductKind.PRODUCT,
      hubspotId: 'hs-1',
      pricerEntityId: 'p-1',
      changedFields: { name: { pricer: 'A', hubspot: 'B' } },
      changedFieldsHash: 'h1',
    });
    expect(second.id).toBe(first.id);
    const all = await prisma.hubSpotReviewQueueItem.findMany();
    expect(all.length).toBe(1);
  });

  it('listOpen returns only unresolved rows', async () => {
    const open = await repo.enqueue({
      entityType: HubSpotProductKind.PRODUCT,
      hubspotId: 'hs-1',
      pricerEntityId: 'p-1',
      changedFields: {},
      changedFieldsHash: 'h1',
    });
    const resolved = await repo.enqueue({
      entityType: HubSpotProductKind.BUNDLE,
      hubspotId: 'hs-2',
      pricerEntityId: 'b-1',
      changedFields: {},
      changedFieldsHash: 'h2',
    });
    await repo.resolve(resolved.id, HubSpotReviewResolution.IGNORE, 'user-1');
    const items = await repo.listOpen();
    expect(items.length).toBe(1);
    expect(items[0].id).toBe(open.id);
  });

  it('resolve stamps resolution and resolvedAt', async () => {
    const item = await repo.enqueue({
      entityType: HubSpotProductKind.PRODUCT,
      hubspotId: 'hs-1',
      pricerEntityId: 'p-1',
      changedFields: {},
      changedFieldsHash: 'h1',
    });
    const resolved = await repo.resolve(item.id, HubSpotReviewResolution.ACCEPT_HUBSPOT, 'u-1');
    expect(resolved.resolution).toBe('ACCEPT_HUBSPOT');
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.resolvedByUserId).toBe('u-1');
  });
});
```

- [ ] **Step 4.2: Run test — should fail**

Run: `npm run test:integration -- lib/db/repositories/hubspotReviewQueueItem.test.ts`
Expected: FAIL.

- [ ] **Step 4.3: Implement repository**

```ts
import type { PrismaClient, HubSpotReviewQueueItem, Prisma } from '@prisma/client';
import { HubSpotProductKind, HubSpotReviewResolution } from '@prisma/client';

export class HubSpotReviewQueueItemRepository {
  constructor(private db: PrismaClient) {}

  async enqueue(data: {
    entityType: HubSpotProductKind;
    hubspotId: string;
    pricerEntityId: string;
    changedFields: Prisma.InputJsonValue;
    changedFieldsHash: string;
  }): Promise<HubSpotReviewQueueItem> {
    return this.db.hubSpotReviewQueueItem.upsert({
      where: {
        entityType_hubspotId_changedFieldsHash: {
          entityType: data.entityType,
          hubspotId: data.hubspotId,
          changedFieldsHash: data.changedFieldsHash,
        },
      },
      create: data,
      update: {}, // idempotent: same hash = same detection, no change
    });
  }

  async listOpen(): Promise<HubSpotReviewQueueItem[]> {
    return this.db.hubSpotReviewQueueItem.findMany({
      where: { resolvedAt: null },
      orderBy: { detectedAt: 'asc' },
    });
  }

  async findById(id: string): Promise<HubSpotReviewQueueItem | null> {
    return this.db.hubSpotReviewQueueItem.findUnique({ where: { id } });
  }

  async resolve(
    id: string,
    resolution: HubSpotReviewResolution,
    userId: string,
  ): Promise<HubSpotReviewQueueItem> {
    return this.db.hubSpotReviewQueueItem.update({
      where: { id },
      data: { resolution, resolvedAt: new Date(), resolvedByUserId: userId },
    });
  }
}
```

- [ ] **Step 4.4: Run test — should pass**

Run: `npm run test:integration -- lib/db/repositories/hubspotReviewQueueItem.test.ts`
Expected: 3 PASS.

- [ ] **Step 4.5: Commit**

```bash
git add lib/db/repositories/hubspotReviewQueueItem.ts lib/db/repositories/hubspotReviewQueueItem.test.ts
git commit -m "feat(hubspot): HubSpotReviewQueueItem repository with idempotent enqueue"
```

---

## Task 5: HubSpot fetch client (`hubspotFetch`)

**Files:**
- Create: `lib/hubspot/client.ts`
- Create: `lib/hubspot/client.test.ts`

- [ ] **Step 5.1: Write failing test for the client — happy path + rate-limit retry + 4xx surfacing**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hubspotFetch, HubSpotApiError } from './client';

describe('hubspotFetch', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.HUBSPOT_ACCESS_TOKEN = 'test-token';
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('sends Bearer auth + JSON body and returns parsed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'hs-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    const result = await hubspotFetch<{ id: string }>({
      method: 'POST',
      path: '/crm/v3/objects/products',
      body: { name: 'Ninja Notes' },
      correlationId: 'corr-1',
    });

    expect(result).toEqual({ id: 'hs-123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.hubapi.com/crm/v3/objects/products');
    expect((init as RequestInit).method).toBe('POST');
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('authorization')).toBe('Bearer test-token');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('retries on 429 respecting Retry-After', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', {
          status: 429,
          headers: { 'retry-after': '2' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    global.fetch = fetchMock;

    const promise = hubspotFetch<{ ok: boolean }>({
      method: 'GET',
      path: '/crm/v3/objects/products',
      correlationId: 'corr-2',
    });

    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws HubSpotApiError on 4xx other than 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'bad input' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    await expect(
      hubspotFetch({
        method: 'POST',
        path: '/crm/v3/objects/products',
        body: {},
        correlationId: 'corr-3',
      }),
    ).rejects.toBeInstanceOf(HubSpotApiError);
  });

  it('retries on 5xx up to maxAttempts then throws', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('boom', { status: 503 }),
    );
    global.fetch = fetchMock;

    const promise = hubspotFetch({
      method: 'GET',
      path: '/x',
      correlationId: 'corr-4',
    });

    // 3 attempts total (initial + 2 retries); backoff times 500ms, 1000ms, 2000ms
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(promise).rejects.toBeInstanceOf(HubSpotApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
```

Add the missing import at the top: `import { afterEach } from 'vitest';`

- [ ] **Step 5.2: Run test — should fail**

Run: `npm test -- lib/hubspot/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement the client**

```ts
const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

export class HubSpotApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'HubSpotApiError';
  }
}

export interface HubSpotFetchOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  correlationId: string;
}

function buildUrl(path: string, query?: HubSpotFetchOptions['query']): string {
  const url = new URL(path, HUBSPOT_API_BASE);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function hubspotFetch<T = unknown>(options: HubSpotFetchOptions): Promise<T> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    throw new HubSpotApiError(0, 'HUBSPOT_ACCESS_TOKEN not configured', undefined, options.correlationId);
  }

  const url = buildUrl(options.path, options.query);
  const init: RequestInit = {
    method: options.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Correlation-Id': options.correlationId,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  };

  let lastError: HubSpotApiError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, init);

    if (res.status >= 200 && res.status < 300) {
      if (res.status === 204) return undefined as T;
      const contentType = res.headers.get('content-type') ?? '';
      return contentType.includes('application/json') ? ((await res.json()) as T) : ((await res.text()) as unknown as T);
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '1', 10);
      const waitMs = Math.max(retryAfter, 1) * 1000;
      lastError = new HubSpotApiError(429, `Rate limited`, undefined, options.correlationId);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(waitMs);
        continue;
      }
      throw lastError;
    }

    if (res.status >= 500) {
      const body = await res.text();
      lastError = new HubSpotApiError(res.status, `HubSpot ${res.status}: ${body}`, body, options.correlationId);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
        continue;
      }
      throw lastError;
    }

    // 4xx (non-429) — surface immediately
    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json') ? await res.json() : await res.text();
    throw new HubSpotApiError(res.status, `HubSpot ${res.status}`, body, options.correlationId);
  }

  throw lastError ?? new HubSpotApiError(0, 'unreachable', undefined, options.correlationId);
}
```

- [ ] **Step 5.4: Run test — should pass**

Run: `npm test -- lib/hubspot/client.test.ts`
Expected: 4 PASS.

- [ ] **Step 5.5: Commit**

```bash
git add lib/hubspot/client.ts lib/hubspot/client.test.ts
git commit -m "feat(hubspot): hubspotFetch wrapper with rate-limit + 5xx retries"
```

---

## Task 6: Deterministic hash of synced fields

**Files:**
- Create: `lib/hubspot/catalog/hash.ts`
- Create: `lib/hubspot/catalog/hash.test.ts`

- [ ] **Step 6.1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { hashSyncedFields, type ProductSyncFields, type BundleSyncFields } from './hash';

describe('hashSyncedFields', () => {
  it('produces a stable hash for equivalent inputs', () => {
    const a: ProductSyncFields = {
      kind: 'PRODUCT',
      name: 'Ninja Notes',
      sku: 'NN-01',
      description: 'Note capture',
      unitPrice: '500.00',
      recurringBillingFrequency: 'monthly',
    };
    const b: ProductSyncFields = { ...a };
    expect(hashSyncedFields(a)).toBe(hashSyncedFields(b));
  });

  it('differs when any synced field changes', () => {
    const base: ProductSyncFields = {
      kind: 'PRODUCT',
      name: 'Ninja Notes',
      sku: 'NN-01',
      description: 'Note capture',
      unitPrice: '500.00',
      recurringBillingFrequency: 'monthly',
    };
    const h0 = hashSyncedFields(base);
    expect(hashSyncedFields({ ...base, name: 'Ninja Notes Plus' })).not.toBe(h0);
    expect(hashSyncedFields({ ...base, unitPrice: '501.00' })).not.toBe(h0);
    expect(hashSyncedFields({ ...base, description: 'x' })).not.toBe(h0);
  });

  it('normalises number formatting so "500" and "500.00" hash the same', () => {
    const a = hashSyncedFields({
      kind: 'PRODUCT',
      name: 'X',
      sku: 'S',
      description: '',
      unitPrice: '500',
      recurringBillingFrequency: 'monthly',
    });
    const b = hashSyncedFields({
      kind: 'PRODUCT',
      name: 'X',
      sku: 'S',
      description: '',
      unitPrice: '500.00',
      recurringBillingFrequency: 'monthly',
    });
    expect(a).toBe(b);
  });

  it('bundle hash includes sorted item identifiers', () => {
    const a: BundleSyncFields = {
      kind: 'BUNDLE',
      name: 'Growth',
      sku: 'B-GROW',
      description: '',
      unitPrice: '900.00',
      recurringBillingFrequency: 'monthly',
      itemIdentifiers: ['p-1', 'p-2'],
    };
    const b: BundleSyncFields = { ...a, itemIdentifiers: ['p-2', 'p-1'] };
    expect(hashSyncedFields(a)).toBe(hashSyncedFields(b));
  });

  it('bundle hash changes when items change', () => {
    const a: BundleSyncFields = {
      kind: 'BUNDLE',
      name: 'Growth',
      sku: 'B-GROW',
      description: '',
      unitPrice: '900.00',
      recurringBillingFrequency: 'monthly',
      itemIdentifiers: ['p-1', 'p-2'],
    };
    const b: BundleSyncFields = { ...a, itemIdentifiers: ['p-1', 'p-3'] };
    expect(hashSyncedFields(a)).not.toBe(hashSyncedFields(b));
  });
});
```

- [ ] **Step 6.2: Run test — should fail**

Run: `npm test -- lib/hubspot/catalog/hash.test.ts`
Expected: FAIL.

- [ ] **Step 6.3: Implement hash**

```ts
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';

export interface ProductSyncFields {
  kind: 'PRODUCT';
  name: string;
  sku: string;
  description: string;
  unitPrice: string | number;
  recurringBillingFrequency: string;
}

export interface BundleSyncFields {
  kind: 'BUNDLE';
  name: string;
  sku: string;
  description: string;
  unitPrice: string | number;
  recurringBillingFrequency: string;
  itemIdentifiers: string[];
}

export type SyncFields = ProductSyncFields | BundleSyncFields;

function canonicalise(v: SyncFields): string {
  const price = new Decimal(v.unitPrice).toFixed(4); // canonical decimal
  const base = {
    kind: v.kind,
    name: v.name.trim(),
    sku: v.sku.trim(),
    description: v.description.trim(),
    unitPrice: price,
    recurringBillingFrequency: v.recurringBillingFrequency,
  };
  if (v.kind === 'BUNDLE') {
    const items = [...v.itemIdentifiers].sort();
    return JSON.stringify({ ...base, itemIdentifiers: items });
  }
  return JSON.stringify(base);
}

export function hashSyncedFields(fields: SyncFields): string {
  return createHash('sha256').update(canonicalise(fields)).digest('hex');
}
```

- [ ] **Step 6.4: Run test — should pass**

Run: `npm test -- lib/hubspot/catalog/hash.test.ts`
Expected: 5 PASS.

- [ ] **Step 6.5: Commit**

```bash
git add lib/hubspot/catalog/hash.ts lib/hubspot/catalog/hash.test.ts
git commit -m "feat(hubspot): deterministic sync-field hash"
```

---

## Task 7: Pricer → HubSpot catalog translator

**Files:**
- Create: `lib/hubspot/catalog/translator.ts`
- Create: `lib/hubspot/catalog/translator.test.ts`

Purpose: convert a pricer `Product` or `Bundle` (with its dependencies) into the `SyncFields` the hash sees AND the full HubSpot API payload for create/update.

- [ ] **Step 7.1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { productToHubSpot, bundleToHubSpot } from './translator';

describe('productToHubSpot', () => {
  it('maps SaaS product to HubSpot payload', () => {
    const result = productToHubSpot({
      id: 'p-1',
      name: 'Ninja Notes',
      kind: 'SAAS',
      sku: 'NN-01',
      description: 'Note capture',
      headlineMonthlyPrice: new Decimal('500.00'),
    });

    expect(result.syncFields).toEqual({
      kind: 'PRODUCT',
      name: 'Ninja Notes',
      sku: 'NN-01',
      description: 'Note capture',
      unitPrice: '500.00',
      recurringBillingFrequency: 'monthly',
    });
    expect(result.payload.properties.name).toBe('Ninja Notes');
    expect(result.payload.properties.price).toBe('500.00');
    expect(result.payload.properties.recurringbillingfrequency).toBe('monthly');
    expect(result.payload.properties.pricer_managed).toBe('true');
    expect(result.payload.properties.pricer_product_id).toBe('p-1');
    expect(result.payload.properties.pricer_kind).toBe('product');
  });
});

describe('bundleToHubSpot', () => {
  it('maps bundle to HubSpot payload with rolled-up price', () => {
    const result = bundleToHubSpot({
      id: 'b-1',
      name: 'Growth Bundle',
      sku: 'B-GROW',
      description: 'Scale-up package',
      rolledUpMonthlyPrice: new Decimal('900.00'),
      itemIdentifiers: ['p-1', 'p-2'],
    });

    expect(result.syncFields).toEqual({
      kind: 'BUNDLE',
      name: 'Growth Bundle',
      sku: 'B-GROW',
      description: 'Scale-up package',
      unitPrice: '900.00',
      recurringBillingFrequency: 'monthly',
      itemIdentifiers: ['p-1', 'p-2'],
    });
    expect(result.payload.properties.pricer_kind).toBe('bundle');
    expect(result.payload.properties.pricer_product_id).toBe('b-1');
  });
});
```

- [ ] **Step 7.2: Run test — should fail**

Run: `npm test -- lib/hubspot/catalog/translator.test.ts`
Expected: FAIL.

- [ ] **Step 7.3: Implement translator**

```ts
import type Decimal from 'decimal.js';
import type { ProductSyncFields, BundleSyncFields } from './hash';

export interface ProductInput {
  id: string;
  name: string;
  kind: string; // pricer ProductKind
  sku: string;
  description: string;
  headlineMonthlyPrice: Decimal;
}

export interface BundleInput {
  id: string;
  name: string;
  sku: string;
  description: string;
  rolledUpMonthlyPrice: Decimal;
  itemIdentifiers: string[];
}

export interface HubSpotProductPayload {
  properties: Record<string, string>;
}

export interface TranslatedProduct {
  syncFields: ProductSyncFields;
  payload: HubSpotProductPayload;
}

export interface TranslatedBundle {
  syncFields: BundleSyncFields;
  payload: HubSpotProductPayload;
}

export function productToHubSpot(input: ProductInput): TranslatedProduct {
  const priceStr = input.headlineMonthlyPrice.toFixed(2);
  return {
    syncFields: {
      kind: 'PRODUCT',
      name: input.name,
      sku: input.sku,
      description: input.description,
      unitPrice: priceStr,
      recurringBillingFrequency: 'monthly',
    },
    payload: {
      properties: {
        name: input.name,
        hs_sku: input.sku,
        description: input.description,
        price: priceStr,
        recurringbillingfrequency: 'monthly',
        pricer_managed: 'true',
        pricer_product_id: input.id,
        pricer_kind: 'product',
      },
    },
  };
}

export function bundleToHubSpot(input: BundleInput): TranslatedBundle {
  const priceStr = input.rolledUpMonthlyPrice.toFixed(2);
  return {
    syncFields: {
      kind: 'BUNDLE',
      name: input.name,
      sku: input.sku,
      description: input.description,
      unitPrice: priceStr,
      recurringBillingFrequency: 'monthly',
      itemIdentifiers: input.itemIdentifiers,
    },
    payload: {
      properties: {
        name: input.name,
        hs_sku: input.sku,
        description: input.description,
        price: priceStr,
        recurringbillingfrequency: 'monthly',
        pricer_managed: 'true',
        pricer_product_id: input.id,
        pricer_kind: 'bundle',
      },
    },
  };
}
```

- [ ] **Step 7.4: Run test — should pass**

Run: `npm test -- lib/hubspot/catalog/translator.test.ts`
Expected: 2 PASS.

- [ ] **Step 7.5: Commit**

```bash
git add lib/hubspot/catalog/translator.ts lib/hubspot/catalog/translator.test.ts
git commit -m "feat(hubspot): translator from pricer Product/Bundle to HubSpot payload"
```

---

## Task 8: Custom property provisioning

**Files:**
- Create: `lib/hubspot/setup/provisionProperties.ts`
- Create: `lib/hubspot/setup/provisionProperties.test.ts`

- [ ] **Step 8.1: Write failing test (client mocked)**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { provisionCustomProperties } from './provisionProperties';
import * as client from '../client';

describe('provisionCustomProperties', () => {
  const fetchSpy = vi.spyOn(client, 'hubspotFetch');

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('creates each missing property exactly once', async () => {
    // getProperty → 404 for every probe; createProperty returns success
    fetchSpy.mockImplementation(async ({ method, path }) => {
      if (method === 'GET') throw new client.HubSpotApiError(404, 'not found');
      if (method === 'POST') return { name: path };
      throw new Error(`unexpected ${method} ${path}`);
    });

    const summary = await provisionCustomProperties({ correlationId: 'test' });

    expect(summary.created.length).toBeGreaterThanOrEqual(4); // at least pricer_managed/id/kind/hash
    expect(summary.alreadyPresent.length).toBe(0);
    const createCalls = fetchSpy.mock.calls.filter(([args]) => args.method === 'POST');
    expect(createCalls.length).toBe(summary.created.length);
  });

  it('is idempotent: existing properties are left alone', async () => {
    fetchSpy.mockImplementation(async ({ method }) => {
      if (method === 'GET') return { name: 'exists' };
      throw new Error('should not create');
    });

    const summary = await provisionCustomProperties({ correlationId: 'test' });
    expect(summary.created).toEqual([]);
    expect(summary.alreadyPresent.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 8.2: Run test — should fail**

Run: `npm test -- lib/hubspot/setup/provisionProperties.test.ts`
Expected: FAIL.

- [ ] **Step 8.3: Implement provisioning**

```ts
import { hubspotFetch, HubSpotApiError } from '../client';

export interface PropertyDefinition {
  objectType: 'products' | 'line_items' | 'deals' | 'quotes';
  name: string;
  label: string;
  type: 'string' | 'number' | 'enumeration' | 'bool';
  fieldType: 'text' | 'number' | 'select' | 'booleancheckbox';
  options?: Array<{ label: string; value: string }>;
  groupName: string;
}

export const REQUIRED_PROPERTIES: PropertyDefinition[] = [
  // Products
  { objectType: 'products', name: 'pricer_managed', label: 'Pricer Managed', type: 'bool', fieldType: 'booleancheckbox', groupName: 'productinformation' },
  { objectType: 'products', name: 'pricer_product_id', label: 'Pricer Product ID', type: 'string', fieldType: 'text', groupName: 'productinformation' },
  { objectType: 'products', name: 'pricer_kind', label: 'Pricer Kind', type: 'enumeration', fieldType: 'select', groupName: 'productinformation', options: [{ label: 'Product', value: 'product' }, { label: 'Bundle', value: 'bundle' }] },
  { objectType: 'products', name: 'pricer_last_synced_hash', label: 'Pricer Last Synced Hash', type: 'string', fieldType: 'text', groupName: 'productinformation' },
  // Line items (used by later phases, created now so a single setup run covers everything)
  { objectType: 'line_items', name: 'pricer_reason', label: 'Pricer Reason', type: 'enumeration', fieldType: 'select', groupName: 'lineiteminformation', options: [
    { label: 'Bundle Rollup', value: 'bundle_rollup' },
    { label: 'Negotiated', value: 'negotiated' },
    { label: 'Ramp', value: 'ramp' },
    { label: 'Other', value: 'other' },
  ] },
  { objectType: 'line_items', name: 'pricer_original_list_price', label: 'Pricer Original List Price', type: 'number', fieldType: 'number', groupName: 'lineiteminformation' },
  { objectType: 'line_items', name: 'pricer_scenario_id', label: 'Pricer Scenario ID', type: 'string', fieldType: 'text', groupName: 'lineiteminformation' },
  { objectType: 'line_items', name: 'pricer_ramp_schedule', label: 'Pricer Ramp Schedule (JSON)', type: 'string', fieldType: 'text', groupName: 'lineiteminformation' },
  // Deals
  { objectType: 'deals', name: 'pricer_scenario_id', label: 'Pricer Scenario ID', type: 'string', fieldType: 'text', groupName: 'dealinformation' },
  { objectType: 'deals', name: 'pricer_approval_status', label: 'Pricer Approval Status', type: 'enumeration', fieldType: 'select', groupName: 'dealinformation', options: [
    { label: 'Not Required', value: 'not_required' },
    { label: 'Pending', value: 'pending' },
    { label: 'Approved', value: 'approved' },
    { label: 'Rejected', value: 'rejected' },
  ] },
  { objectType: 'deals', name: 'pricer_margin_pct', label: 'Pricer Margin %', type: 'number', fieldType: 'number', groupName: 'dealinformation' },
  // Quotes
  { objectType: 'quotes', name: 'pricer_scenario_id', label: 'Pricer Scenario ID', type: 'string', fieldType: 'text', groupName: 'quoteinformation' },
  { objectType: 'quotes', name: 'pricer_revision', label: 'Pricer Revision', type: 'number', fieldType: 'number', groupName: 'quoteinformation' },
  { objectType: 'quotes', name: 'pricer_supersedes', label: 'Pricer Supersedes Quote ID', type: 'string', fieldType: 'text', groupName: 'quoteinformation' },
];

export interface ProvisionSummary {
  created: Array<{ objectType: string; name: string }>;
  alreadyPresent: Array<{ objectType: string; name: string }>;
}

export async function provisionCustomProperties(opts: { correlationId: string }): Promise<ProvisionSummary> {
  const summary: ProvisionSummary = { created: [], alreadyPresent: [] };

  for (const def of REQUIRED_PROPERTIES) {
    try {
      await hubspotFetch({
        method: 'GET',
        path: `/crm/v3/properties/${def.objectType}/${def.name}`,
        correlationId: opts.correlationId,
      });
      summary.alreadyPresent.push({ objectType: def.objectType, name: def.name });
    } catch (err) {
      if (err instanceof HubSpotApiError && err.status === 404) {
        await hubspotFetch({
          method: 'POST',
          path: `/crm/v3/properties/${def.objectType}`,
          body: {
            name: def.name,
            label: def.label,
            type: def.type,
            fieldType: def.fieldType,
            groupName: def.groupName,
            options: def.options,
          },
          correlationId: opts.correlationId,
        });
        summary.created.push({ objectType: def.objectType, name: def.name });
      } else {
        throw err;
      }
    }
  }

  return summary;
}
```

- [ ] **Step 8.4: Run test — should pass**

Run: `npm test -- lib/hubspot/setup/provisionProperties.test.ts`
Expected: 2 PASS.

- [ ] **Step 8.5: Commit**

```bash
git add lib/hubspot/setup/provisionProperties.ts lib/hubspot/setup/provisionProperties.test.ts
git commit -m "feat(hubspot): idempotent custom-property provisioning"
```

---

## Task 9: Setup script

**Files:**
- Create: `scripts/hubspot-setup.ts`

- [ ] **Step 9.1: Implement script**

```ts
#!/usr/bin/env tsx
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { provisionCustomProperties } from '../lib/hubspot/setup/provisionProperties';

async function main() {
  const correlationId = `setup-${randomUUID()}`;
  console.log(`[hubspot-setup] correlationId=${correlationId}`);

  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    console.error('HUBSPOT_ACCESS_TOKEN not set in environment');
    process.exit(1);
  }

  console.log('Provisioning custom properties...');
  const summary = await provisionCustomProperties({ correlationId });
  console.log(`  Created: ${summary.created.length}`);
  for (const c of summary.created) console.log(`    + ${c.objectType}.${c.name}`);
  console.log(`  Already present: ${summary.alreadyPresent.length}`);

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 9.2: Add npm script for convenience**

Modify `package.json`, add under `"scripts"`:

```json
"hubspot:setup": "tsx scripts/hubspot-setup.ts"
```

- [ ] **Step 9.3: Document env vars**

Modify `.env.example` (create if missing), add:

```
# HubSpot integration (Phase 1+)
HUBSPOT_ACCESS_TOKEN=
HUBSPOT_PORTAL_ID=
```

- [ ] **Step 9.4: Commit**

```bash
git add scripts/hubspot-setup.ts package.json .env.example
git commit -m "feat(hubspot): setup script + npm run hubspot:setup"
```

---

## Task 10: Catalog service — gather pricer state for sync

A thin service that loads active pricer Products and Bundles with the information the translator needs.

**Files:**
- Create: `lib/hubspot/catalog/snapshot.ts`
- Create: `lib/hubspot/catalog/snapshot.test.ts`

- [ ] **Step 10.1: Write failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient, ProductKind } from '@prisma/client';
import Decimal from 'decimal.js';
import { loadCatalogSnapshot } from './snapshot';

const prisma = new PrismaClient();

describe('loadCatalogSnapshot', () => {
  beforeEach(async () => {
    await prisma.bundleItem.deleteMany();
    await prisma.bundle.deleteMany();
    await prisma.listPrice.deleteMany();
    await prisma.product.deleteMany();
  });

  it('returns only active products', async () => {
    const active = await prisma.product.create({
      data: { name: 'Active', kind: ProductKind.SAAS, isActive: true, sku: 'A', description: '' },
    });
    await prisma.listPrice.create({ data: { productId: active.id, monthlyUsd: new Decimal('500') } });

    await prisma.product.create({
      data: { name: 'Inactive', kind: ProductKind.SAAS, isActive: false, sku: 'I', description: '' },
    });

    const snap = await loadCatalogSnapshot(prisma);
    expect(snap.products.length).toBe(1);
    expect(snap.products[0].name).toBe('Active');
    expect(snap.products[0].headlineMonthlyPrice.toString()).toBe('500');
  });
});
```

**Note:** If your `Product` / `ListPrice` schemas use different field names than shown, adjust the test accordingly. Re-read `prisma/schema.prisma` before implementing to make sure you pull the right fields.

- [ ] **Step 10.2: Read schema and adjust field names**

Open `prisma/schema.prisma` and identify:
- `Product` fields: `id`, `name`, `kind`, `isActive`, `sku?`, `description?`
- `ListPrice` or similar: where is headline price stored per product?
- `Bundle` fields and item relations

Adjust the test from Step 10.1 to match actual field names.

- [ ] **Step 10.3: Run test — should fail**

Run: `npm run test:integration -- lib/hubspot/catalog/snapshot.test.ts`
Expected: FAIL.

- [ ] **Step 10.4: Implement snapshot loader**

```ts
import type { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import type { ProductInput, BundleInput } from './translator';

export interface CatalogSnapshot {
  products: ProductInput[];
  bundles: BundleInput[];
}

export async function loadCatalogSnapshot(prisma: PrismaClient): Promise<CatalogSnapshot> {
  const activeProducts = await prisma.product.findMany({
    where: { isActive: true },
    include: { listPrices: true }, // adjust based on actual relation name
  });

  const products: ProductInput[] = activeProducts.map((p) => {
    const headline = p.listPrices?.[0]?.monthlyUsd ?? new Decimal(0);
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      sku: p.sku ?? '',
      description: p.description ?? '',
      headlineMonthlyPrice: new Decimal(headline.toString()),
    };
  });

  const activeBundles = await prisma.bundle.findMany({
    where: { isActive: true },
    include: { items: true },
  });

  const bundles: BundleInput[] = activeBundles.map((b) => ({
    id: b.id,
    name: b.name,
    sku: b.sku ?? '',
    description: b.description ?? '',
    rolledUpMonthlyPrice: new Decimal((b as unknown as { rolledUpMonthlyPrice?: string }).rolledUpMonthlyPrice ?? 0),
    itemIdentifiers: b.items.map((i) => i.productId),
  }));

  return { products, bundles };
}
```

**If rolled-up bundle price isn't stored directly:** compute it on the fly by summing item prices via the existing `lib/engine` helpers — cross-reference the v1 spec's pricing formulas for bundles. Keep this helper pure; do not call the HubSpot client from here.

- [ ] **Step 10.5: Run test — should pass**

Run: `npm run test:integration -- lib/hubspot/catalog/snapshot.test.ts`
Expected: PASS.

- [ ] **Step 10.6: Commit**

```bash
git add lib/hubspot/catalog/snapshot.ts lib/hubspot/catalog/snapshot.test.ts
git commit -m "feat(hubspot): catalog snapshot loader for sync"
```

---

## Task 11: Push flow — `publishCatalogToHubSpot`

**Files:**
- Create: `lib/hubspot/catalog/push.ts`
- Create: `lib/hubspot/catalog/push.test.ts`

- [ ] **Step 11.1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import * as client from '../client';
import { publishCatalogToHubSpot } from './push';

describe('publishCatalogToHubSpot', () => {
  const fetchSpy = vi.spyOn(client, 'hubspotFetch');

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('creates missing products in HubSpot and records mappings', async () => {
    fetchSpy.mockResolvedValue({ id: 'hs-new-1' });

    const snapshot = {
      products: [
        {
          id: 'p-1',
          name: 'Ninja Notes',
          kind: 'SAAS',
          sku: 'NN-01',
          description: '',
          headlineMonthlyPrice: new Decimal('500'),
        },
      ],
      bundles: [],
    };

    const result = await publishCatalogToHubSpot({
      snapshot,
      existingMappings: [],
      correlationId: 'c1',
      now: () => new Date('2026-04-21T00:00:00Z'),
    });

    expect(result.created.length).toBe(1);
    expect(result.created[0]).toEqual({
      pricerId: 'p-1',
      kind: 'PRODUCT',
      hubspotProductId: 'hs-new-1',
      hash: expect.any(String),
    });
    expect(result.updated).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it('updates changed products and skips unchanged', async () => {
    fetchSpy.mockResolvedValue({ id: 'ignored-create-response' });

    // Compute the hash for p-2 up front so we can pre-seed its mapping with a matching value.
    const { hashSyncedFields } = await import('./hash');
    const p2Hash = hashSyncedFields({
      kind: 'PRODUCT',
      name: 'Other',
      sku: 'OT-01',
      description: '',
      unitPrice: '100.00',
      recurringBillingFrequency: 'monthly',
    });

    const snapshot = {
      products: [
        {
          id: 'p-1',
          name: 'Ninja Notes',
          kind: 'SAAS',
          sku: 'NN-01',
          description: 'v2',
          headlineMonthlyPrice: new Decimal('500'),
        },
        {
          id: 'p-2',
          name: 'Other',
          kind: 'SAAS',
          sku: 'OT-01',
          description: '',
          headlineMonthlyPrice: new Decimal('100'),
        },
      ],
      bundles: [],
    };

    const result = await publishCatalogToHubSpot({
      snapshot,
      existingMappings: [
        { pricerProductId: 'p-1', pricerBundleId: null, hubspotProductId: 'hs-1', kind: 'PRODUCT', lastSyncedHash: 'stale' },
        { pricerProductId: 'p-2', pricerBundleId: null, hubspotProductId: 'hs-2', kind: 'PRODUCT', lastSyncedHash: p2Hash },
      ],
      correlationId: 'c2',
      now: () => new Date(),
    });

    expect(result.created).toEqual([]);
    expect(result.updated.map((u) => u.pricerId)).toEqual(['p-1']);
    expect(result.unchanged.map((u) => u.pricerId)).toEqual(['p-2']);
    // exactly one PATCH should have been called (for p-1)
    const patchCalls = fetchSpy.mock.calls.filter(([args]) => args.method === 'PATCH');
    expect(patchCalls.length).toBe(1);
  });
});
```

- [ ] **Step 11.2: Run test — should fail**

Run: `npm test -- lib/hubspot/catalog/push.test.ts`
Expected: FAIL.

- [ ] **Step 11.3: Implement push**

```ts
import { hubspotFetch } from '../client';
import { hashSyncedFields } from './hash';
import { productToHubSpot, bundleToHubSpot } from './translator';
import type { CatalogSnapshot } from './snapshot';

export interface ExistingMapping {
  id?: string;
  pricerProductId: string | null;
  pricerBundleId: string | null;
  hubspotProductId: string;
  kind: 'PRODUCT' | 'BUNDLE';
  lastSyncedHash: string;
}

export interface PushOutcome {
  created: Array<{ pricerId: string; kind: 'PRODUCT' | 'BUNDLE'; hubspotProductId: string; hash: string }>;
  updated: Array<{ pricerId: string; kind: 'PRODUCT' | 'BUNDLE'; hubspotProductId: string; hash: string }>;
  unchanged: Array<{ pricerId: string; kind: 'PRODUCT' | 'BUNDLE'; hubspotProductId: string }>;
  failed: Array<{ pricerId: string; kind: 'PRODUCT' | 'BUNDLE'; error: string }>;
}

export interface PushInput {
  snapshot: CatalogSnapshot;
  existingMappings: ExistingMapping[];
  correlationId: string;
  now: () => Date;
}

export async function publishCatalogToHubSpot(input: PushInput): Promise<PushOutcome> {
  const outcome: PushOutcome = { created: [], updated: [], unchanged: [], failed: [] };

  const mapByProduct = new Map(input.existingMappings.filter((m) => m.pricerProductId).map((m) => [m.pricerProductId!, m]));
  const mapByBundle = new Map(input.existingMappings.filter((m) => m.pricerBundleId).map((m) => [m.pricerBundleId!, m]));

  for (const p of input.snapshot.products) {
    const { syncFields, payload } = productToHubSpot(p);
    const hash = hashSyncedFields(syncFields);
    const mapping = mapByProduct.get(p.id);

    try {
      if (!mapping) {
        const res = await hubspotFetch<{ id: string }>({
          method: 'POST',
          path: '/crm/v3/objects/products',
          body: { properties: { ...payload.properties, pricer_last_synced_hash: hash } },
          correlationId: input.correlationId,
        });
        outcome.created.push({ pricerId: p.id, kind: 'PRODUCT', hubspotProductId: res.id, hash });
      } else if (mapping.lastSyncedHash === hash) {
        outcome.unchanged.push({ pricerId: p.id, kind: 'PRODUCT', hubspotProductId: mapping.hubspotProductId });
      } else {
        await hubspotFetch({
          method: 'PATCH',
          path: `/crm/v3/objects/products/${mapping.hubspotProductId}`,
          body: { properties: { ...payload.properties, pricer_last_synced_hash: hash } },
          correlationId: input.correlationId,
        });
        outcome.updated.push({ pricerId: p.id, kind: 'PRODUCT', hubspotProductId: mapping.hubspotProductId, hash });
      }
    } catch (err) {
      outcome.failed.push({ pricerId: p.id, kind: 'PRODUCT', error: err instanceof Error ? err.message : String(err) });
    }
  }

  for (const b of input.snapshot.bundles) {
    const { syncFields, payload } = bundleToHubSpot(b);
    const hash = hashSyncedFields(syncFields);
    const mapping = mapByBundle.get(b.id);

    try {
      if (!mapping) {
        const res = await hubspotFetch<{ id: string }>({
          method: 'POST',
          path: '/crm/v3/objects/products',
          body: { properties: { ...payload.properties, pricer_last_synced_hash: hash } },
          correlationId: input.correlationId,
        });
        outcome.created.push({ pricerId: b.id, kind: 'BUNDLE', hubspotProductId: res.id, hash });
      } else if (mapping.lastSyncedHash === hash) {
        outcome.unchanged.push({ pricerId: b.id, kind: 'BUNDLE', hubspotProductId: mapping.hubspotProductId });
      } else {
        await hubspotFetch({
          method: 'PATCH',
          path: `/crm/v3/objects/products/${mapping.hubspotProductId}`,
          body: { properties: { ...payload.properties, pricer_last_synced_hash: hash } },
          correlationId: input.correlationId,
        });
        outcome.updated.push({ pricerId: b.id, kind: 'BUNDLE', hubspotProductId: mapping.hubspotProductId, hash });
      }
    } catch (err) {
      outcome.failed.push({ pricerId: b.id, kind: 'BUNDLE', error: err instanceof Error ? err.message : String(err) });
    }
  }

  return outcome;
}
```

- [ ] **Step 11.4: Run test — should pass**

Run: `npm test -- lib/hubspot/catalog/push.test.ts`
Expected: PASS.

- [ ] **Step 11.5: Commit**

```bash
git add lib/hubspot/catalog/push.ts lib/hubspot/catalog/push.test.ts
git commit -m "feat(hubspot): pure push flow (create/update/unchanged)"
```

---

## Task 12: Pull flow — detect HubSpot-side changes

**Files:**
- Create: `lib/hubspot/catalog/pull.ts`
- Create: `lib/hubspot/catalog/pull.test.ts`

- [ ] **Step 12.1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as client from '../client';
import { pullHubSpotChanges } from './pull';

describe('pullHubSpotChanges', () => {
  const fetchSpy = vi.spyOn(client, 'hubspotFetch');

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('enqueues review items when HubSpot hash differs from mapping hash', async () => {
    fetchSpy.mockResolvedValue({
      results: [
        {
          id: 'hs-1',
          properties: {
            name: 'Renamed',
            hs_sku: 'NN-01',
            description: '',
            price: '500.00',
            recurringbillingfrequency: 'monthly',
            pricer_managed: 'true',
            pricer_product_id: 'p-1',
            pricer_kind: 'product',
            pricer_last_synced_hash: 'old',
          },
        },
      ],
    });

    const review = await pullHubSpotChanges({
      existingMappings: [
        { pricerProductId: 'p-1', pricerBundleId: null, hubspotProductId: 'hs-1', kind: 'PRODUCT', lastSyncedHash: 'old' },
      ],
      pricerSnapshot: {
        products: [
          {
            id: 'p-1',
            name: 'Ninja Notes',
            kind: 'SAAS',
            sku: 'NN-01',
            description: '',
            headlineMonthlyPrice: { toFixed: () => '500.00', toString: () => '500.00' } as any,
          },
        ],
        bundles: [],
      },
      correlationId: 'c1',
    });

    expect(review.reviewItems.length).toBe(1);
    expect(review.reviewItems[0].pricerEntityId).toBe('p-1');
    expect(review.reviewItems[0].changedFields).toMatchObject({ name: { pricer: 'Ninja Notes', hubspot: 'Renamed' } });
  });

  it('skips items where HubSpot matches pricer (no drift)', async () => {
    // HubSpot returns a product whose synced fields exactly match the pricer snapshot.
    // Its current hash should equal the mapping's lastSyncedHash — which means no review item.
    fetchSpy.mockResolvedValue({
      results: [
        {
          id: 'hs-1',
          properties: {
            name: 'Ninja Notes',
            hs_sku: 'NN-01',
            description: '',
            price: '500.00',
            recurringbillingfrequency: 'monthly',
            pricer_managed: 'true',
            pricer_product_id: 'p-1',
            pricer_kind: 'product',
            pricer_last_synced_hash: 'anything',
          },
        },
      ],
    });

    // Compute the shared hash up front so the mapping and HubSpot side line up
    const { hashSyncedFields } = await import('./hash');
    const sharedHash = hashSyncedFields({
      kind: 'PRODUCT',
      name: 'Ninja Notes',
      sku: 'NN-01',
      description: '',
      unitPrice: '500.00',
      recurringBillingFrequency: 'monthly',
    });

    const review = await pullHubSpotChanges({
      existingMappings: [
        { pricerProductId: 'p-1', pricerBundleId: null, hubspotProductId: 'hs-1', kind: 'PRODUCT', lastSyncedHash: sharedHash },
      ],
      pricerSnapshot: {
        products: [
          {
            id: 'p-1',
            name: 'Ninja Notes',
            kind: 'SAAS',
            sku: 'NN-01',
            description: '',
            headlineMonthlyPrice: { toFixed: (d: number) => (500).toFixed(d), toString: () => '500' } as any,
          },
        ],
        bundles: [],
      },
      correlationId: 'c2',
    });

    expect(review.reviewItems.length).toBe(0);
  });
});
```

- [ ] **Step 12.2: Run test — should fail**

Run: `npm test -- lib/hubspot/catalog/pull.test.ts`
Expected: FAIL.

- [ ] **Step 12.3: Implement pull**

```ts
import { hubspotFetch } from '../client';
import { hashSyncedFields } from './hash';
import type { CatalogSnapshot } from './snapshot';
import { productToHubSpot, bundleToHubSpot } from './translator';
import type { ExistingMapping } from './push';

export interface ReviewItemInput {
  entityType: 'PRODUCT' | 'BUNDLE';
  hubspotId: string;
  pricerEntityId: string;
  changedFields: Record<string, { pricer: unknown; hubspot: unknown }>;
  changedFieldsHash: string;
}

export interface PullOutcome {
  reviewItems: ReviewItemInput[];
  orphansInHubSpot: Array<{ hubspotId: string; pricerEntityId: string }>;
}

export async function pullHubSpotChanges(input: {
  existingMappings: ExistingMapping[];
  pricerSnapshot: CatalogSnapshot;
  correlationId: string;
}): Promise<PullOutcome> {
  // Query HubSpot for pricer-managed products
  const properties = 'name,hs_sku,description,price,recurringbillingfrequency,pricer_managed,pricer_product_id,pricer_kind,pricer_last_synced_hash';
  const res = await hubspotFetch<{ results: Array<{ id: string; properties: Record<string, string> }> }>({
    method: 'POST',
    path: '/crm/v3/objects/products/search',
    body: {
      filterGroups: [{ filters: [{ propertyName: 'pricer_managed', operator: 'EQ', value: 'true' }] }],
      properties: properties.split(','),
      limit: 100,
    },
    correlationId: input.correlationId,
  });

  const mapByHubspotId = new Map(input.existingMappings.map((m) => [m.hubspotProductId, m]));
  const pricerProductById = new Map(input.pricerSnapshot.products.map((p) => [p.id, p]));
  const pricerBundleById = new Map(input.pricerSnapshot.bundles.map((b) => [b.id, b]));

  const reviewItems: ReviewItemInput[] = [];
  const orphans: PullOutcome['orphansInHubSpot'] = [];

  for (const row of res.results) {
    const mapping = mapByHubspotId.get(row.id);
    const pricerId = row.properties.pricer_product_id;
    const kind = row.properties.pricer_kind === 'bundle' ? 'BUNDLE' : 'PRODUCT';

    if (!mapping) {
      orphans.push({ hubspotId: row.id, pricerEntityId: pricerId });
      continue;
    }

    // Compute pricer-side hash from snapshot
    let pricerHash: string;
    let pricerSyncFieldsObj: Record<string, unknown>;
    if (kind === 'PRODUCT') {
      const p = pricerProductById.get(pricerId);
      if (!p) {
        orphans.push({ hubspotId: row.id, pricerEntityId: pricerId });
        continue;
      }
      const { syncFields } = productToHubSpot(p);
      pricerHash = hashSyncedFields(syncFields);
      pricerSyncFieldsObj = syncFields as unknown as Record<string, unknown>;
    } else {
      const b = pricerBundleById.get(pricerId);
      if (!b) {
        orphans.push({ hubspotId: row.id, pricerEntityId: pricerId });
        continue;
      }
      const { syncFields } = bundleToHubSpot(b);
      pricerHash = hashSyncedFields(syncFields);
      pricerSyncFieldsObj = syncFields as unknown as Record<string, unknown>;
    }

    const hubspotStamp = row.properties.pricer_last_synced_hash;
    // HubSpot-side edit detected when:
    //   - the stamp is out of date vs what's on the other HubSpot fields, AND
    //   - the pricer side still matches the mapping's last-synced hash.
    // Simpler approximation: if HubSpot's current fields diverge from pricer's, and mapping matches pricer, flag it.

    const hubspotSyncFields = buildHubSpotSyncFieldsFromRow(row);
    const hubspotHash = hashSyncedFields(hubspotSyncFields);

    if (hubspotHash === mapping.lastSyncedHash) {
      continue; // HubSpot didn't change since last sync
    }

    if (pricerHash === mapping.lastSyncedHash) {
      // pricer didn't change; HubSpot did → this is a HubSpot-side edit we need to review
      const changedFields = diffFields(pricerSyncFieldsObj, hubspotSyncFields as unknown as Record<string, unknown>);
      reviewItems.push({
        entityType: kind,
        hubspotId: row.id,
        pricerEntityId: pricerId,
        changedFields,
        changedFieldsHash: hubspotHash,
      });
    }
    // else: both sides changed — pricer push will overwrite, not a review concern.
  }

  return { reviewItems, orphansInHubSpot: orphans };
}

function buildHubSpotSyncFieldsFromRow(row: { properties: Record<string, string> }): Parameters<typeof hashSyncedFields>[0] {
  const common = {
    name: row.properties.name ?? '',
    sku: row.properties.hs_sku ?? '',
    description: row.properties.description ?? '',
    unitPrice: row.properties.price ?? '0',
    recurringBillingFrequency: row.properties.recurringbillingfrequency ?? 'monthly',
  };
  if (row.properties.pricer_kind === 'bundle') {
    return { kind: 'BUNDLE', ...common, itemIdentifiers: [] }; // bundle-item membership is not in HubSpot side
  }
  return { kind: 'PRODUCT', ...common };
}

function diffFields(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, { pricer: unknown; hubspot: unknown }> {
  const diff: Record<string, { pricer: unknown; hubspot: unknown }> = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === 'kind' || k === 'itemIdentifiers') continue;
    if (a[k] !== b[k]) diff[k] = { pricer: a[k], hubspot: b[k] };
  }
  return diff;
}
```

**Key caveat:** bundle membership isn't represented on the HubSpot side, so the pull never generates review items for bundle-item-list changes. That's correct — item-list changes on the pricer side are always outbound.

- [ ] **Step 12.4: Run test — should pass**

Run: `npm test -- lib/hubspot/catalog/pull.test.ts`
Expected: PASS.

- [ ] **Step 12.5: Commit**

```bash
git add lib/hubspot/catalog/pull.ts lib/hubspot/catalog/pull.test.ts
git commit -m "feat(hubspot): pure pull flow producing review queue items"
```

---

## Task 13: Review queue resolver

**Files:**
- Create: `lib/hubspot/catalog/reviewQueue.ts`
- Create: `lib/hubspot/catalog/reviewQueue.test.ts`

- [ ] **Step 13.1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient, HubSpotProductKind, HubSpotReviewResolution, ProductKind } from '@prisma/client';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';
import { ReviewQueueService } from './reviewQueue';

const prisma = new PrismaClient();

describe('ReviewQueueService', () => {
  const repo = new HubSpotReviewQueueItemRepository(prisma);
  const service = new ReviewQueueService(repo, prisma);

  beforeEach(async () => {
    await prisma.hubSpotReviewQueueItem.deleteMany();
    await prisma.product.deleteMany();
  });

  it('IGNORE marks resolved without touching product', async () => {
    const product = await prisma.product.create({
      data: { name: 'Notes', kind: ProductKind.SAAS, isActive: true, sku: 'NN', description: '' },
    });
    const item = await repo.enqueue({
      entityType: HubSpotProductKind.PRODUCT,
      hubspotId: 'hs-1',
      pricerEntityId: product.id,
      changedFields: { name: { pricer: 'Notes', hubspot: 'Renamed' } },
      changedFieldsHash: 'h',
    });

    await service.resolve({ itemId: item.id, resolution: HubSpotReviewResolution.IGNORE, userId: 'u' });

    const updated = await prisma.product.findUnique({ where: { id: product.id } });
    expect(updated?.name).toBe('Notes');
    const resolved = await repo.findById(item.id);
    expect(resolved?.resolution).toBe('IGNORE');
  });

  it('ACCEPT_HUBSPOT applies the HubSpot value back to the pricer product', async () => {
    const product = await prisma.product.create({
      data: { name: 'Notes', kind: ProductKind.SAAS, isActive: true, sku: 'NN', description: '' },
    });
    const item = await repo.enqueue({
      entityType: HubSpotProductKind.PRODUCT,
      hubspotId: 'hs-1',
      pricerEntityId: product.id,
      changedFields: { name: { pricer: 'Notes', hubspot: 'Renamed' } },
      changedFieldsHash: 'h',
    });

    await service.resolve({ itemId: item.id, resolution: HubSpotReviewResolution.ACCEPT_HUBSPOT, userId: 'u' });

    const updated = await prisma.product.findUnique({ where: { id: product.id } });
    expect(updated?.name).toBe('Renamed');
  });
});
```

- [ ] **Step 13.2: Run test — should fail**

Run: `npm run test:integration -- lib/hubspot/catalog/reviewQueue.test.ts`
Expected: FAIL.

- [ ] **Step 13.3: Implement service**

```ts
import type { PrismaClient } from '@prisma/client';
import { HubSpotReviewResolution, HubSpotProductKind } from '@prisma/client';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';

export interface ResolveInput {
  itemId: string;
  resolution: HubSpotReviewResolution;
  userId: string;
}

export class ReviewQueueService {
  constructor(
    private repo: HubSpotReviewQueueItemRepository,
    private prisma: PrismaClient,
  ) {}

  async resolve(input: ResolveInput): Promise<void> {
    const item = await this.repo.findById(input.itemId);
    if (!item) throw new Error(`Review item ${input.itemId} not found`);
    if (item.resolvedAt) return; // already resolved — idempotent

    if (input.resolution === HubSpotReviewResolution.ACCEPT_HUBSPOT) {
      await this.applyHubSpotChangeToPricer(item);
    }
    // REJECT and IGNORE do nothing to the pricer state — REJECT signals "next push will overwrite."

    await this.repo.resolve(input.itemId, input.resolution, input.userId);
  }

  private async applyHubSpotChangeToPricer(item: {
    entityType: HubSpotProductKind;
    pricerEntityId: string;
    changedFields: unknown;
  }): Promise<void> {
    const changed = item.changedFields as Record<string, { pricer: unknown; hubspot: unknown }>;

    const update: Record<string, unknown> = {};
    for (const [field, values] of Object.entries(changed)) {
      // Only apply fields we know how to write — guard against schema drift
      if (field === 'name' && typeof values.hubspot === 'string') update.name = values.hubspot;
      if (field === 'description' && typeof values.hubspot === 'string') update.description = values.hubspot;
      if (field === 'sku' && typeof values.hubspot === 'string') update.sku = values.hubspot;
    }

    if (Object.keys(update).length === 0) return;

    if (item.entityType === HubSpotProductKind.PRODUCT) {
      await this.prisma.product.update({ where: { id: item.pricerEntityId }, data: update });
    } else {
      await this.prisma.bundle.update({ where: { id: item.pricerEntityId }, data: update });
    }
  }
}
```

**Note on scope:** `ACCEPT_HUBSPOT` only syncs back fields the pricer can write — `name`, `description`, `sku`. Price changes from HubSpot don't auto-apply because price is pricer-authoritative (stored in `ListPrice`, not on the product itself). Admin uses REJECT or adjusts pricer-side pricing manually.

- [ ] **Step 13.4: Run test — should pass**

Run: `npm run test:integration -- lib/hubspot/catalog/reviewQueue.test.ts`
Expected: 2 PASS.

- [ ] **Step 13.5: Commit**

```bash
git add lib/hubspot/catalog/reviewQueue.ts lib/hubspot/catalog/reviewQueue.test.ts
git commit -m "feat(hubspot): review queue resolver with ACCEPT_HUBSPOT apply-back"
```

---

## Task 14: High-level orchestrator — `runCatalogSync`

Single entry point the admin UI and MCP tools call. Loads the snapshot, existing mappings, runs push + pull, persists outcomes (mapping writes, review-queue inserts), updates `HubSpotConfig.lastPushAt` / `lastPullAt`.

**Files:**
- Create: `lib/hubspot/catalog/orchestrator.ts`
- Create: `lib/hubspot/catalog/orchestrator.test.ts`

- [ ] **Step 14.1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient, ProductKind } from '@prisma/client';
import Decimal from 'decimal.js';
import * as client from '../client';
import { runCatalogPush, runCatalogPull } from './orchestrator';

const prisma = new PrismaClient();

describe('runCatalogPush (integration)', () => {
  const fetchSpy = vi.spyOn(client, 'hubspotFetch');

  beforeEach(async () => {
    fetchSpy.mockReset();
    await prisma.hubSpotProductMap.deleteMany();
    await prisma.listPrice.deleteMany();
    await prisma.product.deleteMany();
    await prisma.hubSpotConfig.deleteMany();
  });

  it('creates mapping rows for new HubSpot products and stamps lastPushAt', async () => {
    fetchSpy.mockResolvedValue({ id: 'hs-new-1' });

    await prisma.hubSpotConfig.create({
      data: { portalId: 'p1', enabled: true, accessTokenSecretRef: 'env:HUBSPOT_ACCESS_TOKEN' },
    });
    const product = await prisma.product.create({
      data: { name: 'Ninja Notes', kind: ProductKind.SAAS, isActive: true, sku: 'NN-01', description: '' },
    });
    await prisma.listPrice.create({ data: { productId: product.id, monthlyUsd: new Decimal('500') } });

    const summary = await runCatalogPush({ prisma, correlationId: 'test' });

    expect(summary.created.length).toBe(1);
    const mapping = await prisma.hubSpotProductMap.findFirst({ where: { pricerProductId: product.id } });
    expect(mapping?.hubspotProductId).toBe('hs-new-1');
    const config = await prisma.hubSpotConfig.findFirst();
    expect(config?.lastPushAt).not.toBeNull();
  });
});
```

- [ ] **Step 14.2: Run test — should fail**

Run: `npm run test:integration -- lib/hubspot/catalog/orchestrator.test.ts`
Expected: FAIL.

- [ ] **Step 14.3: Implement orchestrator**

```ts
import type { PrismaClient } from '@prisma/client';
import { HubSpotConfigRepository } from '@/lib/db/repositories/hubspotConfig';
import { HubSpotProductMapRepository } from '@/lib/db/repositories/hubspotProductMap';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';
import { loadCatalogSnapshot } from './snapshot';
import { publishCatalogToHubSpot, type ExistingMapping, type PushOutcome } from './push';
import { pullHubSpotChanges, type PullOutcome } from './pull';

export async function runCatalogPush(input: {
  prisma: PrismaClient;
  correlationId: string;
}): Promise<PushOutcome> {
  const configRepo = new HubSpotConfigRepository(input.prisma);
  const mapRepo = new HubSpotProductMapRepository(input.prisma);

  const mappings = await mapRepo.listAll();
  const existing: ExistingMapping[] = mappings.map((m) => ({
    id: m.id,
    pricerProductId: m.pricerProductId,
    pricerBundleId: m.pricerBundleId,
    hubspotProductId: m.hubspotProductId,
    kind: m.kind,
    lastSyncedHash: m.lastSyncedHash,
  }));

  const snapshot = await loadCatalogSnapshot(input.prisma);

  const now = new Date();
  const outcome = await publishCatalogToHubSpot({
    snapshot,
    existingMappings: existing,
    correlationId: input.correlationId,
    now: () => now,
  });

  // Persist mapping writes
  for (const c of outcome.created) {
    if (c.kind === 'PRODUCT') {
      await mapRepo.createForProduct({
        pricerProductId: c.pricerId,
        hubspotProductId: c.hubspotProductId,
        lastSyncedHash: c.hash,
        lastSyncedAt: now,
      });
    } else {
      await mapRepo.createForBundle({
        pricerBundleId: c.pricerId,
        hubspotProductId: c.hubspotProductId,
        lastSyncedHash: c.hash,
        lastSyncedAt: now,
      });
    }
  }
  for (const u of outcome.updated) {
    const mappingId = existing.find(
      (m) => (m.pricerProductId === u.pricerId || m.pricerBundleId === u.pricerId) && m.hubspotProductId === u.hubspotProductId,
    )?.id;
    if (mappingId) await mapRepo.updateHash(mappingId, u.hash, now);
  }

  const config = await configRepo.findCurrent();
  if (config) await configRepo.markPushed(config.id, now);

  return outcome;
}

export async function runCatalogPull(input: {
  prisma: PrismaClient;
  correlationId: string;
}): Promise<PullOutcome> {
  const configRepo = new HubSpotConfigRepository(input.prisma);
  const mapRepo = new HubSpotProductMapRepository(input.prisma);
  const reviewRepo = new HubSpotReviewQueueItemRepository(input.prisma);

  const mappings = await mapRepo.listAll();
  const existing: ExistingMapping[] = mappings.map((m) => ({
    id: m.id,
    pricerProductId: m.pricerProductId,
    pricerBundleId: m.pricerBundleId,
    hubspotProductId: m.hubspotProductId,
    kind: m.kind,
    lastSyncedHash: m.lastSyncedHash,
  }));
  const snapshot = await loadCatalogSnapshot(input.prisma);

  const outcome = await pullHubSpotChanges({
    existingMappings: existing,
    pricerSnapshot: snapshot,
    correlationId: input.correlationId,
  });

  for (const item of outcome.reviewItems) {
    await reviewRepo.enqueue({
      entityType: item.entityType,
      hubspotId: item.hubspotId,
      pricerEntityId: item.pricerEntityId,
      changedFields: item.changedFields as unknown as any,
      changedFieldsHash: item.changedFieldsHash,
    });
  }

  const config = await configRepo.findCurrent();
  if (config) await configRepo.markPulled(config.id, new Date());

  return outcome;
}
```

- [ ] **Step 14.4: Run test — should pass**

Run: `npm run test:integration -- lib/hubspot/catalog/orchestrator.test.ts`
Expected: PASS.

- [ ] **Step 14.5: Commit**

```bash
git add lib/hubspot/catalog/orchestrator.ts lib/hubspot/catalog/orchestrator.test.ts
git commit -m "feat(hubspot): orchestrator (runCatalogPush, runCatalogPull)"
```

---

## Task 15: MCP tools

**Files:**
- Create: `lib/mcp/tools/hubspot.ts`
- Create: `lib/mcp/tools/hubspot.test.ts`
- Modify: `app/api/mcp/route.ts` (the default tool array lives there at lines 15–25)

- [ ] **Step 15.1: (already known — skip lookup)**

The tools array is at `app/api/mcp/route.ts:15-25`. Existing tool files export arrays named like `readTools`, `railTools`, etc. We'll follow the same pattern and export `hubspotCatalogTools` as an array containing our four new `ToolDefinition` objects.

- [ ] **Step 15.2: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  publishCatalogTool,
  pullHubSpotChangesTool,
  resolveReviewQueueItemTool,
  hubspotIntegrationStatusTool,
} from './hubspot';
import type { McpContext } from '../context';

const adminCtx: McpContext = {
  user: { id: 'u-admin', role: 'ADMIN', email: 'a@x' },
  token: { id: 't', userId: 'u-admin', name: 'admin-token', createdAt: new Date() } as any,
};

describe('hubspot MCP tools', () => {
  it('publishCatalogTool requires admin', () => {
    expect(publishCatalogTool.requiresAdmin).toBe(true);
    expect(publishCatalogTool.isWrite).toBe(true);
  });

  it('resolveReviewQueueItemTool requires admin and validates resolution enum', async () => {
    expect(resolveReviewQueueItemTool.requiresAdmin).toBe(true);
    expect(() => resolveReviewQueueItemTool.inputSchema.parse({ itemId: 'x', resolution: 'BOGUS' })).toThrow();
  });

  it('hubspotIntegrationStatusTool returns config snapshot', async () => {
    // Smoke — the handler calls prisma; an integration test at the server level covers the happy path.
    expect(hubspotIntegrationStatusTool.name).toBe('hubspot_integration_status');
  });
});
```

- [ ] **Step 15.3: Run test — should fail**

Run: `npm test -- lib/mcp/tools/hubspot.test.ts`
Expected: FAIL.

- [ ] **Step 15.4: Implement tools**

```ts
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { HubSpotReviewResolution } from '@prisma/client';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { runCatalogPush, runCatalogPull } from '@/lib/hubspot/catalog/orchestrator';
import { ReviewQueueService } from '@/lib/hubspot/catalog/reviewQueue';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';
import { HubSpotConfigRepository } from '@/lib/db/repositories/hubspotConfig';
import { HubSpotProductMapRepository } from '@/lib/db/repositories/hubspotProductMap';

const emptyInput = z.object({}).strict();

const publishCatalogTool: ToolDefinition<
  z.infer<typeof emptyInput>,
  { correlationId: string; created: number; updated: number; unchanged: number; failed: number }
> = {
  name: 'publish_catalog_to_hubspot',
  description:
    'Admin only. Pushes the pricer catalog (active products + bundles) to HubSpot. Creates missing products, updates changed ones, skips unchanged. Returns counts and correlationId.',
  inputSchema: emptyInput,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'HubSpotCatalog',
  handler: async () => {
    const correlationId = `push-${randomUUID()}`;
    const outcome = await runCatalogPush({ prisma, correlationId });
    return {
      correlationId,
      created: outcome.created.length,
      updated: outcome.updated.length,
      unchanged: outcome.unchanged.length,
      failed: outcome.failed.length,
    };
  },
};

const pullHubSpotChangesTool: ToolDefinition<
  z.infer<typeof emptyInput>,
  { correlationId: string; newReviewItems: number; orphans: number }
> = {
  name: 'pull_hubspot_changes',
  description:
    'Admin only. Pulls pricer-managed products from HubSpot and compares against last-synced state. Adds unresolved diffs to the review queue. Returns counts.',
  inputSchema: emptyInput,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'HubSpotCatalog',
  handler: async () => {
    const correlationId = `pull-${randomUUID()}`;
    const outcome = await runCatalogPull({ prisma, correlationId });
    return {
      correlationId,
      newReviewItems: outcome.reviewItems.length,
      orphans: outcome.orphansInHubSpot.length,
    };
  },
};

const resolveInput = z
  .object({
    itemId: z.string().min(1),
    resolution: z.nativeEnum(HubSpotReviewResolution),
  })
  .strict();

const resolveReviewQueueItemTool: ToolDefinition<z.infer<typeof resolveInput>, { ok: true }> = {
  name: 'resolve_review_queue_item',
  description:
    'Admin only. Resolves a pending review-queue item. ACCEPT_HUBSPOT writes HubSpot value back to the pricer; REJECT marks resolved (next push will overwrite HubSpot); IGNORE marks resolved with no action.',
  inputSchema: resolveInput,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'HubSpotReviewQueueItem',
  extractTargetId: (input) => input.itemId,
  handler: async (ctx, input) => {
    const service = new ReviewQueueService(new HubSpotReviewQueueItemRepository(prisma), prisma);
    await service.resolve({ itemId: input.itemId, resolution: input.resolution, userId: ctx.user.id });
    return { ok: true };
  },
};

const hubspotIntegrationStatusTool: ToolDefinition<
  z.infer<typeof emptyInput>,
  { enabled: boolean; lastPushAt: string | null; lastPullAt: string | null; mappingCount: number; openReviewItems: number }
> = {
  name: 'hubspot_integration_status',
  description:
    'Admin only. Returns HubSpot integration status: enabled flag, last sync timestamps, mapping count, open review-queue count.',
  inputSchema: emptyInput,
  requiresAdmin: true,
  handler: async () => {
    const config = await new HubSpotConfigRepository(prisma).findCurrent();
    const mappings = await new HubSpotProductMapRepository(prisma).listAll();
    const openReview = await new HubSpotReviewQueueItemRepository(prisma).listOpen();
    return {
      enabled: config?.enabled ?? false,
      lastPushAt: config?.lastPushAt?.toISOString() ?? null,
      lastPullAt: config?.lastPullAt?.toISOString() ?? null,
      mappingCount: mappings.length,
      openReviewItems: openReview.length,
    };
  },
};

export const hubspotCatalogTools = [
  publishCatalogTool,
  pullHubSpotChangesTool,
  resolveReviewQueueItemTool,
  hubspotIntegrationStatusTool,
];

// Re-export individual tools for direct testing
export { publishCatalogTool, pullHubSpotChangesTool, resolveReviewQueueItemTool, hubspotIntegrationStatusTool };
```

- [ ] **Step 15.5: Register tools in `app/api/mcp/route.ts`**

Open `app/api/mcp/route.ts`. Add an import after the existing tool imports (around line 13):

```ts
import { hubspotCatalogTools } from '@/lib/mcp/tools/hubspot';
```

Then add to the `tools` array (after `...railTools`, before the closing `]`):

```ts
  ...hubspotCatalogTools,
```

- [ ] **Step 15.6: Run test — should pass**

Run: `npm test -- lib/mcp/tools/hubspot.test.ts`
Expected: PASS. Then run full suite: `npm test` — no regressions.

- [ ] **Step 15.7: Commit**

```bash
git add lib/mcp/tools/hubspot.ts lib/mcp/tools/hubspot.test.ts lib/mcp/server.ts
git commit -m "feat(hubspot): MCP tools (publish, pull, resolve, status)"
```

---

## Task 16: Admin UI — integration status page

**Files:**
- Create: `app/admin/hubspot/page.tsx`
- Create: `app/admin/hubspot/actions.ts`

- [ ] **Step 16.1: Implement server actions**

Create `app/admin/hubspot/actions.ts`:

```ts
'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/client';
import { runCatalogPush, runCatalogPull } from '@/lib/hubspot/catalog/orchestrator';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';
import { ReviewQueueService } from '@/lib/hubspot/catalog/reviewQueue';
import { HubSpotReviewResolution } from '@prisma/client';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    throw new Error('Forbidden');
  }
  return session.user;
}

export async function pushCatalogAction() {
  await requireAdmin();
  const correlationId = `push-${randomUUID()}`;
  const outcome = await runCatalogPush({ prisma, correlationId });
  revalidatePath('/admin/hubspot');
  revalidatePath('/admin/hubspot/sync');
  return { correlationId, ...outcome };
}

export async function pullCatalogAction() {
  await requireAdmin();
  const correlationId = `pull-${randomUUID()}`;
  const outcome = await runCatalogPull({ prisma, correlationId });
  revalidatePath('/admin/hubspot');
  revalidatePath('/admin/hubspot/review-queue');
  return { correlationId, ...outcome };
}

export async function resolveReviewItemAction(input: { itemId: string; resolution: HubSpotReviewResolution }) {
  const user = await requireAdmin();
  const service = new ReviewQueueService(new HubSpotReviewQueueItemRepository(prisma), prisma);
  await service.resolve({ itemId: input.itemId, resolution: input.resolution, userId: user.id });
  revalidatePath('/admin/hubspot/review-queue');
}
```

- [ ] **Step 16.2: Implement status page**

Create `app/admin/hubspot/page.tsx`:

```tsx
import Link from 'next/link';
import { prisma } from '@/lib/db/client';
import { HubSpotConfigRepository } from '@/lib/db/repositories/hubspotConfig';
import { HubSpotProductMapRepository } from '@/lib/db/repositories/hubspotProductMap';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';

export default async function HubSpotStatusPage() {
  const config = await new HubSpotConfigRepository(prisma).findCurrent();
  const mappings = await new HubSpotProductMapRepository(prisma).listAll();
  const openReview = await new HubSpotReviewQueueItemRepository(prisma).listOpen();

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">HubSpot Integration</h1>

      <section className="grid grid-cols-2 gap-4">
        <Stat label="Enabled" value={config?.enabled ? 'Yes' : 'No'} />
        <Stat label="Portal ID" value={config?.portalId ?? '—'} />
        <Stat label="Last Push" value={config?.lastPushAt?.toLocaleString() ?? 'Never'} />
        <Stat label="Last Pull" value={config?.lastPullAt?.toLocaleString() ?? 'Never'} />
        <Stat label="Mappings" value={String(mappings.length)} />
        <Stat label="Open Review Items" value={String(openReview.length)} />
      </section>

      <nav className="flex gap-3">
        <Link href="/admin/hubspot/sync" className="underline">Sync catalog →</Link>
        <Link href="/admin/hubspot/review-queue" className="underline">Review queue →</Link>
      </nav>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-md p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-lg font-medium">{value}</div>
    </div>
  );
}
```

- [ ] **Step 16.3: Smoke test**

Run: `npm run dev`
Navigate: `http://localhost:3000/admin/hubspot`
Expected: page renders with the stats (all zeroed out since no config exists yet).

- [ ] **Step 16.4: Commit**

```bash
git add app/admin/hubspot/page.tsx app/admin/hubspot/actions.ts
git commit -m "feat(hubspot): admin status page + server actions"
```

---

## Task 17: Admin UI — sync page (push + pull buttons)

**Files:**
- Create: `app/admin/hubspot/sync/page.tsx`
- Create: `app/admin/hubspot/sync/SyncButtons.tsx`

- [ ] **Step 17.1: Implement client component**

Create `app/admin/hubspot/sync/SyncButtons.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { pushCatalogAction, pullCatalogAction } from '../actions';

type Outcome =
  | { kind: 'push'; created: number; updated: number; unchanged: number; failed: number; correlationId: string }
  | { kind: 'pull'; newReviewItems: number; orphans: number; correlationId: string }
  | { kind: 'error'; message: string };

export function SyncButtons() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Outcome | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          className="px-4 py-2 rounded-md border bg-primary text-primary-foreground disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              try {
                const r = await pushCatalogAction();
                setResult({ kind: 'push', ...r, created: r.created.length, updated: r.updated.length, unchanged: r.unchanged.length, failed: r.failed.length });
              } catch (err) {
                setResult({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
              }
            })
          }
        >
          Push catalog to HubSpot
        </button>

        <button
          type="button"
          disabled={pending}
          className="px-4 py-2 rounded-md border disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              try {
                const r = await pullCatalogAction();
                setResult({ kind: 'pull', ...r });
              } catch (err) {
                setResult({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
              }
            })
          }
        >
          Pull changes from HubSpot
        </button>
      </div>

      {pending && <p className="text-muted-foreground">Running…</p>}

      {result?.kind === 'push' && (
        <div className="rounded-md border p-4 bg-green-50">
          <div className="font-medium">Push complete ({result.correlationId})</div>
          <div>Created: {result.created}. Updated: {result.updated}. Unchanged: {result.unchanged}. Failed: {result.failed}.</div>
        </div>
      )}
      {result?.kind === 'pull' && (
        <div className="rounded-md border p-4 bg-blue-50">
          <div className="font-medium">Pull complete ({result.correlationId})</div>
          <div>New review items: {result.newReviewItems}. Orphans: {result.orphans}.</div>
        </div>
      )}
      {result?.kind === 'error' && (
        <div className="rounded-md border p-4 bg-red-50">
          <div className="font-medium">Failed</div>
          <div>{result.message}</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 17.2: Implement page**

Create `app/admin/hubspot/sync/page.tsx`:

```tsx
import { SyncButtons } from './SyncButtons';

export default function SyncPage() {
  return (
    <main className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">HubSpot Catalog Sync</h1>
      <p className="text-muted-foreground">
        Manual sync only. Push writes active pricer products and bundles to HubSpot. Pull detects HubSpot-side edits
        to pricer-managed products and enqueues them in the review queue.
      </p>
      <SyncButtons />
    </main>
  );
}
```

- [ ] **Step 17.3: Smoke test**

Run: `npm run dev`
Navigate: `http://localhost:3000/admin/hubspot/sync`
Without a valid `HUBSPOT_ACCESS_TOKEN` set, clicking "Push" should show the error pane with a useful message (e.g., `HUBSPOT_ACCESS_TOKEN not configured`). That's expected — don't mock this away, it's a useful failure surface.

- [ ] **Step 17.4: Commit**

```bash
git add app/admin/hubspot/sync
git commit -m "feat(hubspot): admin sync page with push/pull buttons"
```

---

## Task 18: Admin UI — review queue page

**Files:**
- Create: `app/admin/hubspot/review-queue/page.tsx`
- Create: `app/admin/hubspot/review-queue/ResolveButton.tsx`

- [ ] **Step 18.1: Implement client resolve button**

```tsx
'use client';

import { useTransition } from 'react';
import { HubSpotReviewResolution } from '@prisma/client';
import { resolveReviewItemAction } from '../actions';

export function ResolveButton({ itemId, resolution, label }: { itemId: string; resolution: HubSpotReviewResolution; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs px-2 py-1 border rounded-md disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          await resolveReviewItemAction({ itemId, resolution });
        })
      }
    >
      {pending ? '…' : label}
    </button>
  );
}
```

- [ ] **Step 18.2: Implement page**

```tsx
import { prisma } from '@/lib/db/client';
import { HubSpotReviewQueueItemRepository } from '@/lib/db/repositories/hubspotReviewQueueItem';
import { HubSpotReviewResolution } from '@prisma/client';
import { ResolveButton } from './ResolveButton';

export default async function ReviewQueuePage() {
  const items = await new HubSpotReviewQueueItemRepository(prisma).listOpen();

  return (
    <main className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">HubSpot Review Queue</h1>

      {items.length === 0 && <p className="text-muted-foreground">No pending HubSpot-side edits.</p>}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Entity</th>
            <th>Changed Fields</th>
            <th>Detected</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const fields = it.changedFields as Record<string, { pricer: unknown; hubspot: unknown }>;
            return (
              <tr key={it.id} className="border-b align-top">
                <td className="py-2 pr-4">
                  <div>{it.entityType}</div>
                  <div className="text-xs text-muted-foreground">HS: {it.hubspotId}</div>
                </td>
                <td className="py-2 pr-4">
                  <ul className="space-y-1">
                    {Object.entries(fields).map(([k, v]) => (
                      <li key={k}>
                        <strong>{k}</strong>: <span className="text-muted-foreground">{String(v.pricer)}</span> →{' '}
                        <span>{String(v.hubspot)}</span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="py-2 pr-4">{it.detectedAt.toLocaleString()}</td>
                <td className="py-2 flex gap-2">
                  <ResolveButton itemId={it.id} resolution={HubSpotReviewResolution.ACCEPT_HUBSPOT} label="Accept" />
                  <ResolveButton itemId={it.id} resolution={HubSpotReviewResolution.REJECT} label="Reject" />
                  <ResolveButton itemId={it.id} resolution={HubSpotReviewResolution.IGNORE} label="Ignore" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 18.3: Smoke test**

Run: `npm run dev`
Navigate: `http://localhost:3000/admin/hubspot/review-queue`
Expected: "No pending HubSpot-side edits" message when empty.

- [ ] **Step 18.4: Commit**

```bash
git add app/admin/hubspot/review-queue
git commit -m "feat(hubspot): admin review queue page with resolve actions"
```

---

## Task 19: Full-stack integration test against HubSpot test account

**Files:**
- Create: `tests/integration/hubspot/catalog-roundtrip.test.ts`

This requires a HubSpot Developer Test Account. Skip on CI via env-guard; run manually against the test portal.

- [ ] **Step 19.1: Implement test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, ProductKind } from '@prisma/client';
import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import { hubspotFetch } from '@/lib/hubspot/client';
import { provisionCustomProperties } from '@/lib/hubspot/setup/provisionProperties';
import { runCatalogPush, runCatalogPull } from '@/lib/hubspot/catalog/orchestrator';

const shouldRun = process.env.HUBSPOT_ACCESS_TOKEN && process.env.RUN_HUBSPOT_INTEGRATION === 'true';

const prisma = new PrismaClient();

(shouldRun ? describe : describe.skip)('HubSpot catalog round-trip (live)', () => {
  const correlationId = `int-${randomUUID()}`;
  let createdHsIds: string[] = [];

  beforeAll(async () => {
    await provisionCustomProperties({ correlationId });
    await prisma.hubSpotProductMap.deleteMany();
    await prisma.product.deleteMany({ where: { name: { startsWith: 'IntegrationTest-' } } });
    await prisma.hubSpotConfig.upsert({
      where: { portalId: process.env.HUBSPOT_PORTAL_ID ?? 'test' },
      create: { portalId: process.env.HUBSPOT_PORTAL_ID ?? 'test', enabled: true, accessTokenSecretRef: 'env' },
      update: {},
    });
  });

  afterAll(async () => {
    // Archive products we created in the test portal
    for (const id of createdHsIds) {
      await hubspotFetch({ method: 'DELETE', path: `/crm/v3/objects/products/${id}`, correlationId }).catch(() => {});
    }
    await prisma.product.deleteMany({ where: { name: { startsWith: 'IntegrationTest-' } } });
    await prisma.hubSpotProductMap.deleteMany();
  });

  it('push creates a product in HubSpot and records the mapping', async () => {
    const product = await prisma.product.create({
      data: { name: `IntegrationTest-${Date.now()}`, kind: ProductKind.SAAS, isActive: true, sku: `IT-${Date.now()}`, description: 'int test' },
    });
    await prisma.listPrice.create({ data: { productId: product.id, monthlyUsd: new Decimal('123.45') } });

    const out = await runCatalogPush({ prisma, correlationId });
    expect(out.created.length).toBeGreaterThanOrEqual(1);
    createdHsIds.push(...out.created.map((c) => c.hubspotProductId));

    const mapping = await prisma.hubSpotProductMap.findFirst({ where: { pricerProductId: product.id } });
    expect(mapping).not.toBeNull();
  });

  it('pull with no HubSpot edits yields zero review items', async () => {
    const out = await runCatalogPull({ prisma, correlationId });
    expect(out.reviewItems.length).toBe(0);
  });

  it('pull detects a HubSpot-side edit and enqueues a review item', async () => {
    const mapping = await prisma.hubSpotProductMap.findFirst();
    if (!mapping) throw new Error('expected a mapping from the earlier test');

    // Edit the HubSpot product's name directly
    await hubspotFetch({
      method: 'PATCH',
      path: `/crm/v3/objects/products/${mapping.hubspotProductId}`,
      body: { properties: { name: `HubSpot-edited-${Date.now()}` } },
      correlationId,
    });

    const out = await runCatalogPull({ prisma, correlationId });
    expect(out.reviewItems.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 19.2: Document how to run it**

Add to README or a runbook (create `docs/superpowers/runbooks/hubspot-phase-1.md`):

```markdown
# HubSpot Phase 1 — Manual QA Runbook

## Prerequisites

1. HubSpot Developer Test Account created.
2. Developer Project created under that account; note the private-app access token.
3. `.env.local` populated:
   ```
   HUBSPOT_ACCESS_TOKEN=<token>
   HUBSPOT_PORTAL_ID=<portal id>
   RUN_HUBSPOT_INTEGRATION=true
   ```

## Run setup

```bash
npm run hubspot:setup
```

Expected: 10+ custom properties created across Products, Line Items, Deals, Quotes.

## Run integration test

```bash
npm run test:integration -- tests/integration/hubspot/
```

## Manual smoke

1. Start dev server: `npm run dev`
2. Visit `/admin/hubspot`. Set `HubSpotConfig.enabled = true` via DB console or upsert.
3. Click "Push catalog to HubSpot" on `/admin/hubspot/sync`.
4. Open HubSpot test portal → Settings → Products & Services. Verify products/bundles appear with `pricer_managed = true`.
5. In HubSpot, rename a product.
6. Back in pricer, click "Pull changes from HubSpot".
7. Visit `/admin/hubspot/review-queue`. The edit should appear.
8. Click "Accept" — the pricer product name should update to match.
```

- [ ] **Step 19.3: Commit**

```bash
git add tests/integration/hubspot docs/superpowers/runbooks
git commit -m "test(hubspot): integration test + phase 1 QA runbook"
```

---

## Task 20: Final verification

- [ ] **Step 20.1: Run full test suite**

Run: `npm test` (unit) and `npm run test:integration` (integration against local Postgres).
Expected: all tests pass; no snapshot diffs.

- [ ] **Step 20.2: Run linter + format check**

Run: `npm run lint && npm run format:check`
Expected: clean.

- [ ] **Step 20.3: Verify build**

Run: `npm run build`
Expected: successful Next.js build; no TypeScript errors.

- [ ] **Step 20.4: Confirm spec coverage**

Walk through the spec's [Decisions Summary](../specs/2026-04-21-hubspot-integration-design.md#decisions-summary) rows 1, 2, 10, 11, 12, and 15 — all Phase 1 scope. Confirm each has code + tests + UI landing this phase.

- [ ] **Step 20.5: Commit any lint/format fixes, then stop**

```bash
git add -A
git commit -m "chore(hubspot): phase 1 lint + format"
```

---

## Self-Review Notes

- **Spec coverage.** Phase 1 lands decisions 1 (pricer-authoritative two-way), 2 (products + bundles sync), 10 (manual sync), 11 (initial seed via same tool), 12 (auth model — private app portion; Developer Project wiring deferred to phase 3 when App Card lands), 15 (embedded in pricer). Decisions 3–9, 13, 14 are explicitly phase 2/3/4.
- **No placeholders** — every step shows exact file content or exact command.
- **Type consistency** — `HubSpotProductKind`, `HubSpotReviewResolution`, `ProductSyncFields`/`BundleSyncFields`, `ExistingMapping`, `CatalogSnapshot` are named and referenced identically across tasks.
- **Known dependency on the existing schema.** Task 10's snapshot loader references `listPrices` / `rolledUpMonthlyPrice`; whoever executes this task should re-read `prisma/schema.prisma` first and adjust the loader to match the actual pricer model. This is called out inline in Step 10.2.
- **Webhooks, PDFs, HubSpot Quotes, App Card, Developer Project** — all deferred to later phases per the plan split announced during brainstorming. Nothing here blocks them; all foundational data + client + tools land cleanly for phase 2 to build on.
