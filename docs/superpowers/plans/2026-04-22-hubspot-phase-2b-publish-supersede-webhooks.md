# HubSpot Phase 2b — Publish + Supersede + Terminal Webhooks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end pricer-scenario-to-HubSpot-Quote pipeline with revision supersede and terminal-state round-trip. Rep links a scenario to a Deal, clicks Publish, HubSpot creates the Quote with priced line items. When the customer accepts/declines/expires the quote or the deal is Won/Lost, the pricer learns via signed webhooks.

**Architecture:** Additive Prisma models + a pure translator + a state-machine publisher + two signature-verified webhook endpoints with idempotent async processing. Publishing a revision creates a new HubSpot Quote and marks the prior superseded (never mutates a sent quote). Hard-rail-override approval flow is explicitly **deferred to Phase 2c** — 2b rejects scenarios with unresolved hard overrides at precheck with a clear error.

**Tech Stack:** Next.js 14 (App Router), Prisma 6 + Postgres, Vitest, Zod, HubSpot REST API v3 (Products/Quotes/Line Items/Deals/Contacts/Companies), HubSpot Signature v3 verification.

**Spec reference:** [docs/superpowers/specs/2026-04-22-hubspot-phase-2-publish-approval-webhooks-design.md](../specs/2026-04-22-hubspot-phase-2-publish-approval-webhooks-design.md)

**Explicitly deferred to Phase 2c:**
- Hard-rail-override approval trigger + wait + resume
- `HubSpotApprovalRequest` model and repository
- Deal webhook handling for `pricer_approval_status` changes
- HubSpot Workflow configuration runbook

---

## File Structure

**Created:**
```
lib/engine/bundlePricing.ts                       — pure fn returning Bundle's computed monthly revenue
lib/engine/bundlePricing.test.ts

lib/db/repositories/hubspotQuote.ts
lib/db/repositories/hubspotQuote.db.test.ts
lib/db/repositories/hubspotWebhookEvent.ts
lib/db/repositories/hubspotWebhookEvent.db.test.ts

lib/hubspot/quote/translator.ts                   — scenario → HubSpot line items (pure)
lib/hubspot/quote/translator.test.ts
lib/hubspot/quote/publish.ts                      — state-machine publisher (orchestrates HubSpot API)
lib/hubspot/quote/publish.test.ts
lib/hubspot/quote/supersede.ts                    — revision supersede helper (pure + call)
lib/hubspot/quote/supersede.test.ts

lib/hubspot/webhooks/verify.ts                    — HubSpot v3 signature verification
lib/hubspot/webhooks/verify.test.ts
lib/hubspot/webhooks/process.ts                   — idempotent background event processor
lib/hubspot/webhooks/process.test.ts

app/api/hubspot/webhooks/quote/route.ts           — POST handler (signature → echo → persist → 200 → setImmediate)
app/api/hubspot/webhooks/quote/route.test.ts
app/api/hubspot/webhooks/deal/route.ts
app/api/hubspot/webhooks/deal/route.test.ts

app/admin/hubspot/published-quotes/page.tsx
app/admin/hubspot/webhook-events/page.tsx
app/admin/hubspot/webhook-events/RetryButton.tsx

lib/mcp/tools/hubspotQuote.ts                     — 5 Phase 2b MCP tools
lib/mcp/tools/hubspotQuote.test.ts

docs/superpowers/runbooks/hubspot-phase-2b.md     — deployment + smoke-test checklist
```

**Modified:**
```
prisma/schema.prisma                              — HubSpotQuote, HubSpotWebhookEvent, HubSpotPublishState; additive Scenario/Quote fields
prisma/migrations/<ts>_hubspot_phase_2b_quote_models/migration.sql
lib/hubspot/catalog/snapshot.ts                   — call computeBundleRolledUpMonthlyPrice (drop Decimal(0) placeholder)
lib/hubspot/catalog/snapshot.db.test.ts
app/api/mcp/route.ts                              — register hubspotQuoteTools
app/scenarios/[id]/page.tsx                       — new "HubSpot" section
app/scenarios/[id]/actions.ts                     — link/publish server actions
hubspot-project/src/app/app-hsmeta.json           — webhook subscriptions + webhook URL
```

---

## Task 1: Prisma schema additions

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1.1: Add `HubSpotPublishState` enum**

In `prisma/schema.prisma`, after the existing HubSpot enums (near `HubSpotReviewResolution`), add:

```prisma
enum HubSpotPublishState {
  DRAFT
  PENDING_APPROVAL
  PUBLISHING
  PUBLISHED
  SUPERSEDED
  FAILED
  APPROVAL_REJECTED
}
```

- [ ] **Step 1.2: Add `HubSpotQuote` model**

Append near the other `HubSpot*` models:

```prisma
model HubSpotQuote {
  id                  String              @id @default(cuid())
  scenarioId          String
  revision            Int
  hubspotQuoteId      String              @unique
  shareableUrl        String?
  publishState        HubSpotPublishState
  supersedesQuoteId   String?             @unique
  publishedAt         DateTime?
  lastStatusAt        DateTime?
  lastStatus          String?
  dealOutcomeAt       DateTime?
  dealOutcome         String?
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  scenario            Scenario            @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  supersededBy        HubSpotQuote?       @relation("Supersedes", fields: [supersedesQuoteId], references: [id])
  supersedes          HubSpotQuote?       @relation("Supersedes")

  @@unique([scenarioId, revision])
  @@index([scenarioId])
}
```

- [ ] **Step 1.3: Add `HubSpotWebhookEvent` model**

```prisma
model HubSpotWebhookEvent {
  id                  String    @id @default(cuid())
  hubspotEventId      String    @unique
  subscriptionType    String
  objectType          String
  objectId            String
  payload             Json
  receivedAt          DateTime  @default(now())
  processedAt         DateTime?
  processingError     String?
  processingAttempts  Int       @default(0)

  @@index([processedAt])
}
```

- [ ] **Step 1.4: Add additive fields on Scenario + Quote**

On the existing `Scenario` model, add:

```prisma
  hubspotDealId            String?
  hubspotCompanyId         String?
  hubspotPrimaryContactId  String?
  hubspotQuotes            HubSpotQuote[]
```

On the existing `Quote` model (if present), add:

```prisma
  hubspotQuoteId           String?
  publishState             HubSpotPublishState @default(DRAFT)
```

- [ ] **Step 1.5: Generate + apply migration**

```bash
npx prisma migrate dev --name hubspot_phase_2b_quote_models --create-only
# inspect the generated SQL to verify two CREATE TABLE statements, one CREATE TYPE, three ALTER TABLE
npx prisma migrate dev
```

- [ ] **Step 1.6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(hubspot): add HubSpotQuote + HubSpotWebhookEvent models and Scenario/Quote additive fields"
```

---

## Task 2: `HubSpotQuote` repository

**Files:**
- Create: `lib/db/repositories/hubspotQuote.ts`
- Create: `lib/db/repositories/hubspotQuote.db.test.ts`

- [ ] **Step 2.1: Write failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient, HubSpotPublishState, ProductKind } from '@prisma/client';
import { HubSpotQuoteRepository } from './hubspotQuote';

const prisma = new PrismaClient();

async function seedScenario(): Promise<string> {
  const product = await prisma.product.create({
    data: { name: `Notes-${Date.now()}`, kind: ProductKind.SAAS_USAGE, isActive: true },
  });
  const scenario = await prisma.scenario.create({
    data: { customerName: 'Acme Inc.', contractMonths: 12, productId: product.id } as never,
  });
  return scenario.id;
}

describe('HubSpotQuoteRepository', () => {
  const repo = new HubSpotQuoteRepository(prisma);

  beforeEach(async () => {
    await prisma.hubSpotQuote.deleteMany();
    await prisma.scenario.deleteMany();
    await prisma.product.deleteMany();
  });

  it('create inserts a draft quote', async () => {
    const scenarioId = await seedScenario();
    const row = await repo.create({
      scenarioId,
      revision: 1,
      hubspotQuoteId: 'hs-q-1',
      publishState: HubSpotPublishState.PUBLISHING,
    });
    expect(row.hubspotQuoteId).toBe('hs-q-1');
    expect(row.publishState).toBe('PUBLISHING');
  });

  it('findByScenarioAndRevision returns the matching row', async () => {
    const scenarioId = await seedScenario();
    await repo.create({ scenarioId, revision: 1, hubspotQuoteId: 'hs-q-1', publishState: HubSpotPublishState.PUBLISHED });
    const row = await repo.findByScenarioAndRevision(scenarioId, 1);
    expect(row?.hubspotQuoteId).toBe('hs-q-1');
  });

  it('findLatestByScenario returns highest-revision row', async () => {
    const scenarioId = await seedScenario();
    await repo.create({ scenarioId, revision: 1, hubspotQuoteId: 'hs-q-1', publishState: HubSpotPublishState.SUPERSEDED });
    await repo.create({ scenarioId, revision: 2, hubspotQuoteId: 'hs-q-2', publishState: HubSpotPublishState.PUBLISHED });
    const latest = await repo.findLatestByScenario(scenarioId);
    expect(latest?.revision).toBe(2);
  });

  it('updatePublishState persists state transition', async () => {
    const scenarioId = await seedScenario();
    const row = await repo.create({ scenarioId, revision: 1, hubspotQuoteId: 'hs-q-1', publishState: HubSpotPublishState.PUBLISHING });
    const updated = await repo.updatePublishState(row.id, HubSpotPublishState.PUBLISHED, {
      shareableUrl: 'https://app.hubspot.com/q/x',
      publishedAt: new Date('2026-04-22T10:00:00Z'),
    });
    expect(updated.publishState).toBe('PUBLISHED');
    expect(updated.shareableUrl).toBe('https://app.hubspot.com/q/x');
  });

  it('markSuperseded links old row to new via supersedesQuoteId', async () => {
    const scenarioId = await seedScenario();
    const v1 = await repo.create({ scenarioId, revision: 1, hubspotQuoteId: 'hs-q-1', publishState: HubSpotPublishState.PUBLISHED });
    const v2 = await repo.create({ scenarioId, revision: 2, hubspotQuoteId: 'hs-q-2', publishState: HubSpotPublishState.PUBLISHED });
    const updated = await repo.markSuperseded(v1.id, v2.id);
    expect(updated.publishState).toBe('SUPERSEDED');
    expect(updated.supersedesQuoteId).toBe(v2.id);
  });

  it('recordTerminalStatus updates lastStatus + lastStatusAt', async () => {
    const scenarioId = await seedScenario();
    const row = await repo.create({ scenarioId, revision: 1, hubspotQuoteId: 'hs-q-1', publishState: HubSpotPublishState.PUBLISHED });
    const updated = await repo.recordTerminalStatus(row.hubspotQuoteId, 'ACCEPTED', new Date('2026-04-23T00:00:00Z'));
    expect(updated?.lastStatus).toBe('ACCEPTED');
  });
});
```

**Note on seedScenario:** If `prisma.scenario.create` requires different fields in this codebase's schema, read `prisma/schema.prisma` for the Scenario model and adjust the `data` payload to satisfy all non-nullable fields. Adding `as never` is a local escape hatch if fields vary.

- [ ] **Step 2.2: Implement repository**

```ts
import type { PrismaClient, HubSpotQuote } from '@prisma/client';
import { HubSpotPublishState } from '@prisma/client';

export class HubSpotQuoteRepository {
  constructor(private db: PrismaClient) {}

  async create(data: {
    scenarioId: string;
    revision: number;
    hubspotQuoteId: string;
    publishState: HubSpotPublishState;
    shareableUrl?: string;
  }): Promise<HubSpotQuote> {
    return this.db.hubSpotQuote.create({ data });
  }

  async findById(id: string): Promise<HubSpotQuote | null> {
    return this.db.hubSpotQuote.findUnique({ where: { id } });
  }

  async findByHubspotQuoteId(hubspotQuoteId: string): Promise<HubSpotQuote | null> {
    return this.db.hubSpotQuote.findUnique({ where: { hubspotQuoteId } });
  }

  async findByScenarioAndRevision(scenarioId: string, revision: number): Promise<HubSpotQuote | null> {
    return this.db.hubSpotQuote.findUnique({
      where: { scenarioId_revision: { scenarioId, revision } },
    });
  }

  async findLatestByScenario(scenarioId: string): Promise<HubSpotQuote | null> {
    return this.db.hubSpotQuote.findFirst({
      where: { scenarioId },
      orderBy: { revision: 'desc' },
    });
  }

  async listRecent(limit = 200): Promise<HubSpotQuote[]> {
    return this.db.hubSpotQuote.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }

  async updatePublishState(
    id: string,
    publishState: HubSpotPublishState,
    extras: { shareableUrl?: string; publishedAt?: Date } = {},
  ): Promise<HubSpotQuote> {
    return this.db.hubSpotQuote.update({
      where: { id },
      data: { publishState, ...extras },
    });
  }

  async markSuperseded(oldQuoteId: string, newQuoteId: string): Promise<HubSpotQuote> {
    return this.db.hubSpotQuote.update({
      where: { id: oldQuoteId },
      data: { publishState: HubSpotPublishState.SUPERSEDED, supersedesQuoteId: newQuoteId },
    });
  }

  async recordTerminalStatus(
    hubspotQuoteId: string,
    status: string,
    at: Date,
  ): Promise<HubSpotQuote | null> {
    const existing = await this.findByHubspotQuoteId(hubspotQuoteId);
    if (!existing) return null;
    return this.db.hubSpotQuote.update({
      where: { id: existing.id },
      data: { lastStatus: status, lastStatusAt: at },
    });
  }

  async recordDealOutcome(
    scenarioId: string,
    outcome: string,
    at: Date,
  ): Promise<HubSpotQuote | null> {
    const latest = await this.findLatestByScenario(scenarioId);
    if (!latest) return null;
    return this.db.hubSpotQuote.update({
      where: { id: latest.id },
      data: { dealOutcome: outcome, dealOutcomeAt: at },
    });
  }
}
```

- [ ] **Step 2.3: Run tests**

```bash
npm run test:integration -- lib/db/repositories/hubspotQuote.db.test.ts
```
Expected: 6 pass.

- [ ] **Step 2.4: Commit**

```bash
git add lib/db/repositories/hubspotQuote.ts lib/db/repositories/hubspotQuote.db.test.ts
git commit -m "feat(hubspot): HubSpotQuote repository"
```

---

## Task 3: `HubSpotWebhookEvent` repository

**Files:**
- Create: `lib/db/repositories/hubspotWebhookEvent.ts`
- Create: `lib/db/repositories/hubspotWebhookEvent.db.test.ts`

- [ ] **Step 3.1: Write failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { HubSpotWebhookEventRepository } from './hubspotWebhookEvent';

const prisma = new PrismaClient();

describe('HubSpotWebhookEventRepository', () => {
  const repo = new HubSpotWebhookEventRepository(prisma);

  beforeEach(async () => {
    await prisma.hubSpotWebhookEvent.deleteMany();
  });

  it('persist is idempotent on hubspotEventId', async () => {
    const first = await repo.persist({
      hubspotEventId: 'evt-1',
      subscriptionType: 'quote.propertyChange',
      objectType: 'quote',
      objectId: 'hs-q-1',
      payload: { foo: 'bar' },
    });
    const second = await repo.persist({
      hubspotEventId: 'evt-1',
      subscriptionType: 'quote.propertyChange',
      objectType: 'quote',
      objectId: 'hs-q-1',
      payload: { foo: 'bar' },
    });
    expect(second.id).toBe(first.id);
    const all = await prisma.hubSpotWebhookEvent.findMany();
    expect(all.length).toBe(1);
  });

  it('listUnprocessed returns rows with processedAt null', async () => {
    const a = await repo.persist({ hubspotEventId: 'a', subscriptionType: 't', objectType: 'o', objectId: '1', payload: {} });
    const b = await repo.persist({ hubspotEventId: 'b', subscriptionType: 't', objectType: 'o', objectId: '2', payload: {} });
    await repo.markProcessed(a.id);
    const pending = await repo.listUnprocessed(10);
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(b.id);
  });

  it('markProcessed stamps processedAt', async () => {
    const row = await repo.persist({ hubspotEventId: 'x', subscriptionType: 't', objectType: 'o', objectId: '1', payload: {} });
    const updated = await repo.markProcessed(row.id);
    expect(updated.processedAt).not.toBeNull();
  });

  it('markFailed records error + increments attempts', async () => {
    const row = await repo.persist({ hubspotEventId: 'x', subscriptionType: 't', objectType: 'o', objectId: '1', payload: {} });
    const updated = await repo.markFailed(row.id, 'boom');
    expect(updated.processingError).toBe('boom');
    expect(updated.processingAttempts).toBe(1);
    const again = await repo.markFailed(row.id, 'boom 2');
    expect(again.processingAttempts).toBe(2);
  });
});
```

- [ ] **Step 3.2: Implement**

```ts
import type { PrismaClient, HubSpotWebhookEvent, Prisma } from '@prisma/client';

export class HubSpotWebhookEventRepository {
  constructor(private db: PrismaClient) {}

  async persist(data: {
    hubspotEventId: string;
    subscriptionType: string;
    objectType: string;
    objectId: string;
    payload: Prisma.InputJsonValue;
  }): Promise<HubSpotWebhookEvent> {
    return this.db.hubSpotWebhookEvent.upsert({
      where: { hubspotEventId: data.hubspotEventId },
      create: data,
      update: {},
    });
  }

  async findById(id: string): Promise<HubSpotWebhookEvent | null> {
    return this.db.hubSpotWebhookEvent.findUnique({ where: { id } });
  }

  async listRecent(limit = 200): Promise<HubSpotWebhookEvent[]> {
    return this.db.hubSpotWebhookEvent.findMany({
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });
  }

  async listUnprocessed(limit = 50): Promise<HubSpotWebhookEvent[]> {
    return this.db.hubSpotWebhookEvent.findMany({
      where: { processedAt: null },
      orderBy: { receivedAt: 'asc' },
      take: limit,
    });
  }

  async markProcessed(id: string): Promise<HubSpotWebhookEvent> {
    return this.db.hubSpotWebhookEvent.update({
      where: { id },
      data: { processedAt: new Date(), processingError: null },
    });
  }

  async markFailed(id: string, error: string): Promise<HubSpotWebhookEvent> {
    return this.db.hubSpotWebhookEvent.update({
      where: { id },
      data: { processingError: error, processingAttempts: { increment: 1 } },
    });
  }
}
```

- [ ] **Step 3.3: Run + commit**

```bash
npm run test:integration -- lib/db/repositories/hubspotWebhookEvent.db.test.ts
git add lib/db/repositories/hubspotWebhookEvent.ts lib/db/repositories/hubspotWebhookEvent.db.test.ts
git commit -m "feat(hubspot): HubSpotWebhookEvent repository with idempotent persist"
```

---

## Task 4: `computeBundleRolledUpMonthlyPrice`

**Files:**
- Create: `lib/engine/bundlePricing.ts`
- Create: `lib/engine/bundlePricing.test.ts`

**Context:** The engine's `compute()` in `lib/engine/compute.ts` takes a `ComputeRequest` with `tabs`, `products`, `contractMonths`, etc., and returns `monthlyRevenueCents`. `applyBundleToScenario` in `lib/services/scenario.ts` (line ~224) already converts `BundleItem` rows into scenario tab configs — **read that function before implementing.** This task extracts the equivalent logic into a pure function that synthesizes a ComputeRequest from a bundle alone.

- [ ] **Step 4.1: Read prior art**

Open `lib/services/scenario.ts` and find `applyBundleToScenario` around line 224. Trace how a `BundleItem.config` (JSONB) gets turned into:
- `ScenarioSaaSConfig` for SaaS items (seat_count, persona_mix, discount_override)
- `ScenarioLaborLine` for labor items (sku reference or dept+hours)

Also skim `computeSaaSTab`, `computePackagedLaborTab`, `computeCustomLaborTab` in `lib/engine/*-tab.ts` to understand what each tab needs.

- [ ] **Step 4.2: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeBundleRolledUpMonthlyPrice } from './bundlePricing';

describe('computeBundleRolledUpMonthlyPrice', () => {
  it('returns Decimal(0) for a bundle with no items', () => {
    const result = computeBundleRolledUpMonthlyPrice({
      bundleId: 'b1',
      items: [],
      productSnapshots: { saas: {}, departments: {} },
      contractMonths: 12,
    });
    expect(result.equals(new Decimal(0))).toBe(true);
  });

  it('sums SaaS item monthly revenue from computeSaaSTab', () => {
    // Construct minimal valid snapshots for one SaaS product at $100/seat,
    // 10 seats, no discounts, one persona at 100% mix.
    const productId = 'p-notes';
    const personaId = 'pers-1';
    const result = computeBundleRolledUpMonthlyPrice({
      bundleId: 'b1',
      items: [
        {
          kind: 'SAAS',
          productId,
          config: { seatCount: 10, personaMix: [{ personaId, pct: 100 }], discountOverridePct: null },
        },
      ],
      productSnapshots: {
        saas: {
          [productId]: {
            id: productId,
            name: 'Notes',
            listPriceUsdPerSeatPerMonth: new Decimal(100),
            personas: [{ id: personaId, name: 'Standard', monthlyCostUsd: new Decimal(20) }],
            volumeTiers: [],
            contractModifiers: [],
            baseUsageCostUsd: new Decimal(0),
            otherVariableCostUsd: new Decimal(0),
            fixedCostsMonthlyUsd: new Decimal(0),
            scalePerPlatformPct: new Decimal(0),
          },
        },
        departments: {},
      },
      contractMonths: 12,
    });
    // At 10 seats × $100 no discount, monthly revenue = $1,000
    expect(result.toFixed(2)).toBe('1000.00');
  });
});
```

**Note:** The shape of `productSnapshots.saas[id]` must match what `computeSaaSTab` consumes from `ComputeRequest.products.saas`. Inspect `lib/engine/types.ts` for the exact interface and adjust the fixture to match. Any fields not needed for the simple "seats × list price" computation can be minimal / zero.

- [ ] **Step 4.3: Implement — outline**

Create `lib/engine/bundlePricing.ts`:

```ts
import Decimal from 'decimal.js';
import { compute } from './compute';
import type { ComputeRequest } from './types';

export interface BundleItemInput {
  kind: 'SAAS' | 'PACKAGED_LABOR' | 'CUSTOM_LABOR';
  productId?: string;
  config: Record<string, unknown>;
}

export interface BundlePricingInput {
  bundleId: string;
  items: BundleItemInput[];
  productSnapshots: ComputeRequest['products'];
  contractMonths: number;
}

export function computeBundleRolledUpMonthlyPrice(input: BundlePricingInput): Decimal {
  if (input.items.length === 0) return new Decimal(0);

  const tabs: ComputeRequest['tabs'] = input.items.map((item) => {
    switch (item.kind) {
      case 'SAAS':
        return {
          kind: 'SAAS_USAGE',
          productId: item.productId!,
          seatCount: (item.config.seatCount as number) ?? 0,
          personaMix: (item.config.personaMix as Array<{ personaId: string; pct: number }>) ?? [],
          discountOverridePct: (item.config.discountOverridePct as number | null) ?? null,
        } as ComputeRequest['tabs'][number];
      case 'PACKAGED_LABOR':
        return {
          kind: 'PACKAGED_LABOR',
          skuId: item.config.skuId as string,
          qty: (item.config.qty as number) ?? 1,
        } as ComputeRequest['tabs'][number];
      case 'CUSTOM_LABOR':
        return {
          kind: 'CUSTOM_LABOR',
          departmentId: item.config.departmentId as string,
          hours: (item.config.hours as number) ?? 0,
          rateOverrideUsd: (item.config.rateOverrideUsd as number | null) ?? null,
        } as ComputeRequest['tabs'][number];
    }
  });

  const req: ComputeRequest = {
    tabs,
    products: input.productSnapshots,
    commissionRules: [],
    rails: [],
    contractMonths: input.contractMonths,
  };

  const result = compute(req);
  return new Decimal(result.totals.monthlyRevenueCents).div(100);
}
```

**Refinement:** exact tab shapes depend on `types.ts`. Adjust fields to satisfy the engine's real type definitions. The goal: bundle item → minimal valid tab → `compute()` → return `monthlyRevenueCents / 100` as Decimal.

- [ ] **Step 4.4: Run tests**

```bash
npm test -- lib/engine/bundlePricing.test.ts
```
Expected: 2 pass.

- [ ] **Step 4.5: Commit**

```bash
git add lib/engine/bundlePricing.ts lib/engine/bundlePricing.test.ts
git commit -m "feat(engine): computeBundleRolledUpMonthlyPrice (pure fn synthesizing tabs from bundle items)"
```

---

## Task 5: Wire `computeBundleRolledUpMonthlyPrice` into catalog snapshot

**Files:**
- Modify: `lib/hubspot/catalog/snapshot.ts`
- Modify: `lib/hubspot/catalog/snapshot.db.test.ts`

- [ ] **Step 5.1: Update snapshot loader**

Open `lib/hubspot/catalog/snapshot.ts`. Find where bundles are loaded — currently `rolledUpMonthlyPrice: new Decimal(0)`. Replace with a call to `computeBundleRolledUpMonthlyPrice`.

Since the engine needs product snapshots, you may need to load them (SaaS vendor rates, personas, list prices, volume/contract tiers). If `snapshot.ts` already loads these for some other purpose, reuse. Otherwise load them per bundle.

For Phase 2b, a minimal default is fine: if item membership can't be priced because the catalog snapshot is missing required data, fall back to `Decimal(0)` with a log warning — bundles don't affect catalog sync correctness (HubSpot Product price is informational), so 0 is still acceptable; real bundle pricing happens at publish time via the translator (Task 6).

Simplest: make the snapshot loader pass through `Decimal(0)` for catalog sync (unchanged from Phase 1), but expose `computeBundleRolledUpMonthlyPrice` for the publish flow to call. Update the test to document this split.

- [ ] **Step 5.2: Document the decision in the snapshot file**

Add a comment above the bundle mapping:

```ts
// NOTE: catalog sync keeps bundle price at 0 — the HubSpot Product's `price` field
// is informational for us; quote line items carry the real bundle price via
// computeBundleRolledUpMonthlyPrice (lib/engine/bundlePricing.ts), called by the
// quote publish flow (lib/hubspot/quote/publish.ts).
```

- [ ] **Step 5.3: Update snapshot test**

No behavior change in the snapshot loader output; adjust the comment assertion in the test if any, or add a new assertion confirming `rolledUpMonthlyPrice` is `0` and link to the note.

- [ ] **Step 5.4: Commit**

```bash
git add lib/hubspot/catalog/snapshot.ts lib/hubspot/catalog/snapshot.db.test.ts
git commit -m "chore(hubspot): document that bundle price is computed at publish time, not sync time"
```

---

## Task 6: Scenario → HubSpot line items translator

**Files:**
- Create: `lib/hubspot/quote/translator.ts`
- Create: `lib/hubspot/quote/translator.test.ts`

- [ ] **Step 6.1: Write failing tests covering all `pricer_reason` paths**

```ts
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { scenarioToHubSpotLineItems } from './translator';

describe('scenarioToHubSpotLineItems', () => {
  it('SaaS line with negotiated discount → list + discount (pricer_reason: negotiated)', () => {
    const result = scenarioToHubSpotLineItems({
      scenarioId: 's1',
      tabs: [
        {
          kind: 'SAAS',
          productId: 'p1',
          productName: 'Ninja Notes',
          productSku: 'NN-01',
          productDescription: 'Note capture',
          seatCount: 10,
          listPriceMonthly: new Decimal(100),
          effectiveUnitPriceMonthly: new Decimal(80),
          discountPct: new Decimal(0.2),
          contractMonths: 12,
          rampSchedule: null,
        },
      ],
      bundles: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].properties.pricer_reason).toBe('negotiated');
    expect(result[0].properties.price).toBe('100.00');
    expect(result[0].properties.hs_discount_percentage).toBe('20');
    expect(result[0].properties.pricer_scenario_id).toBe('s1');
  });

  it('bundle line → override unit price (pricer_reason: bundle_rollup)', () => {
    const result = scenarioToHubSpotLineItems({
      scenarioId: 's1',
      tabs: [],
      bundles: [
        {
          bundleId: 'b1',
          bundleName: 'Growth Bundle',
          bundleSku: 'B-GROW',
          bundleDescription: 'Scale-up package',
          rolledUpMonthlyPrice: new Decimal(900),
          itemListPriceSum: new Decimal(1100),
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].properties.pricer_reason).toBe('bundle_rollup');
    expect(result[0].properties.price).toBe('900.00');
    expect(result[0].properties.pricer_original_list_price).toBe('1100.00');
  });

  it('ramp pricing → override + pricer_ramp_schedule JSON', () => {
    const ramp = [
      { monthStart: 1, monthEnd: 3, pricePerSeat: 50 },
      { monthStart: 4, monthEnd: 12, pricePerSeat: 100 },
    ];
    const result = scenarioToHubSpotLineItems({
      scenarioId: 's1',
      tabs: [
        {
          kind: 'SAAS',
          productId: 'p1',
          productName: 'Ninja Notes',
          productSku: 'NN-01',
          productDescription: '',
          seatCount: 10,
          listPriceMonthly: new Decimal(100),
          effectiveUnitPriceMonthly: new Decimal(50),
          discountPct: null,
          contractMonths: 12,
          rampSchedule: ramp,
        },
      ],
      bundles: [],
    });
    expect(result[0].properties.pricer_reason).toBe('ramp');
    expect(result[0].properties.price).toBe('50.00');
    expect(JSON.parse(result[0].properties.pricer_ramp_schedule as string)).toEqual(ramp);
  });

  it('labor line → pricer_reason: other', () => {
    const result = scenarioToHubSpotLineItems({
      scenarioId: 's1',
      tabs: [
        {
          kind: 'LABOR',
          skuId: 'labor-1',
          skuName: 'White-Glove Onboarding',
          skuCode: 'WG-ONBOARD',
          skuDescription: 'Setup + training',
          qty: 1,
          unitPrice: new Decimal(5000),
        },
      ],
      bundles: [],
    });
    expect(result[0].properties.pricer_reason).toBe('other');
    expect(result[0].properties.price).toBe('5000.00');
  });
});
```

- [ ] **Step 6.2: Implement**

Create `lib/hubspot/quote/translator.ts`. Take input shaped as:

```ts
import type Decimal from 'decimal.js';

export interface SaaSLine {
  kind: 'SAAS';
  productId: string;
  productName: string;
  productSku: string;
  productDescription: string;
  seatCount: number;
  listPriceMonthly: Decimal;
  effectiveUnitPriceMonthly: Decimal;
  discountPct: Decimal | null;
  contractMonths: number;
  rampSchedule: Array<{ monthStart: number; monthEnd: number; pricePerSeat: number }> | null;
}

export interface LaborLine {
  kind: 'LABOR';
  skuId: string;
  skuName: string;
  skuCode: string;
  skuDescription: string;
  qty: number;
  unitPrice: Decimal;
}

export interface BundleLine {
  bundleId: string;
  bundleName: string;
  bundleSku: string;
  bundleDescription: string;
  rolledUpMonthlyPrice: Decimal;
  itemListPriceSum: Decimal;
}

export interface TranslatorInput {
  scenarioId: string;
  tabs: Array<SaaSLine | LaborLine>;
  bundles: BundleLine[];
}

export interface HubSpotLineItemPayload {
  properties: Record<string, string>;
}

export function scenarioToHubSpotLineItems(input: TranslatorInput): HubSpotLineItemPayload[] {
  const items: HubSpotLineItemPayload[] = [];

  for (const b of input.bundles) {
    items.push({
      properties: {
        name: b.bundleName,
        description: b.bundleDescription ?? '',
        hs_sku: b.bundleSku ?? '',
        price: b.rolledUpMonthlyPrice.toFixed(2),
        quantity: '1',
        pricer_reason: 'bundle_rollup',
        pricer_scenario_id: input.scenarioId,
        pricer_original_list_price: b.itemListPriceSum.toFixed(2),
      },
    });
  }

  for (const t of input.tabs) {
    if (t.kind === 'LABOR') {
      items.push({
        properties: {
          name: t.skuName,
          description: t.skuDescription ?? '',
          hs_sku: t.skuCode ?? '',
          price: t.unitPrice.toFixed(2),
          quantity: String(t.qty),
          pricer_reason: 'other',
          pricer_scenario_id: input.scenarioId,
        },
      });
      continue;
    }

    // SaaS line
    if (t.rampSchedule) {
      items.push({
        properties: {
          name: t.productName,
          description: t.productDescription ?? '',
          hs_sku: t.productSku ?? '',
          price: t.effectiveUnitPriceMonthly.toFixed(2),
          quantity: String(t.seatCount),
          pricer_reason: 'ramp',
          pricer_scenario_id: input.scenarioId,
          pricer_original_list_price: t.listPriceMonthly.toFixed(2),
          pricer_ramp_schedule: JSON.stringify(t.rampSchedule),
        },
      });
      continue;
    }

    if (t.discountPct && !t.discountPct.isZero()) {
      items.push({
        properties: {
          name: t.productName,
          description: t.productDescription ?? '',
          hs_sku: t.productSku ?? '',
          price: t.listPriceMonthly.toFixed(2),
          quantity: String(t.seatCount),
          hs_discount_percentage: t.discountPct.mul(100).toFixed(0),
          pricer_reason: 'negotiated',
          pricer_scenario_id: input.scenarioId,
        },
      });
      continue;
    }

    // list-priced SaaS with no discount / no ramp
    items.push({
      properties: {
        name: t.productName,
        description: t.productDescription ?? '',
        hs_sku: t.productSku ?? '',
        price: t.listPriceMonthly.toFixed(2),
        quantity: String(t.seatCount),
        pricer_reason: 'other',
        pricer_scenario_id: input.scenarioId,
      },
    });
  }

  return items;
}
```

- [ ] **Step 6.3: Run + commit**

```bash
npm test -- lib/hubspot/quote/translator.test.ts
git add lib/hubspot/quote/translator.ts lib/hubspot/quote/translator.test.ts
git commit -m "feat(hubspot): scenario → HubSpot line items translator (hybrid-by-reason)"
```

---

## Task 7: Publish state machine + supersede

**Files:**
- Create: `lib/hubspot/quote/publish.ts`
- Create: `lib/hubspot/quote/publish.test.ts`

This is the big one. Step-by-step orchestrator with explicit state transitions.

- [ ] **Step 7.1: Write failing tests (happy path + supersede + hard-rail-override rejection)**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import * as client from '../client';
import { publishScenarioToHubSpot, UnresolvedHardRailOverrideError, MissingDealLinkError } from './publish';

const fetchSpy = vi.spyOn(client, 'hubspotFetch');

describe('publishScenarioToHubSpot', () => {
  beforeEach(() => fetchSpy.mockReset());

  it('rejects when scenario has no hubspotDealId', async () => {
    await expect(
      publishScenarioToHubSpot({
        scenario: {
          id: 's1',
          hubspotDealId: null,
          revision: 1,
          hasUnresolvedHardRailOverrides: false,
        },
        lineItems: [],
        now: () => new Date(),
        correlationId: 'c1',
      } as any),
    ).rejects.toBeInstanceOf(MissingDealLinkError);
  });

  it('rejects scenarios with unresolved hard-rail overrides (2b scope)', async () => {
    await expect(
      publishScenarioToHubSpot({
        scenario: {
          id: 's1',
          hubspotDealId: 'd1',
          revision: 1,
          hasUnresolvedHardRailOverrides: true,
        },
        lineItems: [],
        now: () => new Date(),
        correlationId: 'c1',
      } as any),
    ).rejects.toBeInstanceOf(UnresolvedHardRailOverrideError);
  });

  it('happy path creates quote, creates line items, associates, transitions to publishable, returns URL', async () => {
    // Sequence of mocked HubSpot API calls:
    // 1. create quote → { id: 'hs-q-1' }
    // 2. create line item → { id: 'hs-li-1' }
    // 3. associate line item → {} (204)
    // 4. patch quote to publishable → { id: 'hs-q-1', properties: { hs_quote_link: 'https://app.hubspot.com/q/x' } }
    fetchSpy
      .mockResolvedValueOnce({ id: 'hs-q-1' })
      .mockResolvedValueOnce({ id: 'hs-li-1' })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ id: 'hs-q-1', properties: { hs_quote_link: 'https://app.hubspot.com/q/x' } });

    const persistence = {
      createHubSpotQuote: vi.fn().mockResolvedValue({ id: 'row-1' }),
      updatePublishState: vi.fn().mockResolvedValue(undefined),
      findPriorRevision: vi.fn().mockResolvedValue(null),
      markSuperseded: vi.fn(),
    };

    const result = await publishScenarioToHubSpot({
      scenario: {
        id: 's1',
        hubspotDealId: 'd1',
        revision: 1,
        hasUnresolvedHardRailOverrides: false,
      },
      lineItems: [
        { properties: { name: 'Ninja Notes', price: '400.00', quantity: '10', pricer_reason: 'other', pricer_scenario_id: 's1' } },
      ],
      quoteConfig: { name: 'Acme Inc Q1', expirationDays: 30 },
      persistence,
      now: () => new Date('2026-04-22T10:00:00Z'),
      correlationId: 'c1',
    } as any);

    expect(result.hubspotQuoteId).toBe('hs-q-1');
    expect(result.shareableUrl).toBe('https://app.hubspot.com/q/x');
    expect(persistence.updatePublishState).toHaveBeenLastCalledWith(
      'row-1',
      'PUBLISHED',
      expect.objectContaining({ shareableUrl: 'https://app.hubspot.com/q/x' }),
    );
  });

  it('supersedes prior revision when publishing revision 2', async () => {
    fetchSpy
      .mockResolvedValueOnce({ id: 'hs-q-2' })
      .mockResolvedValueOnce({ id: 'hs-li-1' })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ id: 'hs-q-2', properties: { hs_quote_link: 'https://x' } })
      .mockResolvedValueOnce({}); // PATCH old HubSpot quote with pricer_supersedes

    const persistence = {
      createHubSpotQuote: vi.fn().mockResolvedValue({ id: 'row-2' }),
      updatePublishState: vi.fn().mockResolvedValue(undefined),
      findPriorRevision: vi.fn().mockResolvedValue({ id: 'row-1', hubspotQuoteId: 'hs-q-1' }),
      markSuperseded: vi.fn().mockResolvedValue(undefined),
    };

    await publishScenarioToHubSpot({
      scenario: { id: 's1', hubspotDealId: 'd1', revision: 2, hasUnresolvedHardRailOverrides: false },
      lineItems: [{ properties: { name: 'Ninja Notes', price: '400.00', quantity: '10', pricer_reason: 'other', pricer_scenario_id: 's1' } }],
      quoteConfig: { name: 'Acme Inc Q1 v2', expirationDays: 30 },
      persistence,
      now: () => new Date('2026-04-22T10:00:00Z'),
      correlationId: 'c1',
    } as any);

    expect(persistence.markSuperseded).toHaveBeenCalledWith('row-1', 'row-2');
    const patchCalls = fetchSpy.mock.calls.filter(([a]) => a.method === 'PATCH' && a.path.includes('hs-q-1'));
    expect(patchCalls.length).toBe(1); // old HubSpot quote gets pricer_supersedes stamped
  });
});
```

- [ ] **Step 7.2: Implement**

```ts
import { hubspotFetch } from '../client';
import { HubSpotPublishState } from '@prisma/client';
import type { HubSpotLineItemPayload } from './translator';

export class MissingDealLinkError extends Error {
  constructor() { super('Scenario must be linked to a HubSpot Deal before publishing.'); }
}

export class UnresolvedHardRailOverrideError extends Error {
  constructor() { super('Scenario has unresolved hard-rail overrides — approval flow (Phase 2c) required.'); }
}

export interface PublishPersistence {
  createHubSpotQuote(data: {
    scenarioId: string;
    revision: number;
    hubspotQuoteId: string;
    publishState: HubSpotPublishState;
  }): Promise<{ id: string }>;
  updatePublishState(
    rowId: string,
    state: HubSpotPublishState,
    extras?: { shareableUrl?: string; publishedAt?: Date },
  ): Promise<void>;
  findPriorRevision(scenarioId: string, currentRevision: number): Promise<{ id: string; hubspotQuoteId: string } | null>;
  markSuperseded(oldRowId: string, newRowId: string): Promise<void>;
}

export interface PublishInput {
  scenario: {
    id: string;
    hubspotDealId: string | null;
    revision: number;
    hasUnresolvedHardRailOverrides: boolean;
  };
  lineItems: HubSpotLineItemPayload[];
  quoteConfig: { name: string; expirationDays: number };
  persistence: PublishPersistence;
  now: () => Date;
  correlationId: string;
}

export interface PublishOutcome {
  hubspotQuoteId: string;
  shareableUrl: string | null;
}

export async function publishScenarioToHubSpot(input: PublishInput): Promise<PublishOutcome> {
  // Step 1: precheck
  if (!input.scenario.hubspotDealId) throw new MissingDealLinkError();
  if (input.scenario.hasUnresolvedHardRailOverrides) throw new UnresolvedHardRailOverrideError();
  if (input.lineItems.length === 0) throw new Error('Cannot publish a quote with zero line items.');

  // Step 2: create HubSpot Quote
  const expiration = new Date(input.now().getTime() + input.quoteConfig.expirationDays * 24 * 60 * 60 * 1000);
  const quoteRes = await hubspotFetch<{ id: string }>({
    method: 'POST',
    path: '/crm/v3/objects/quotes',
    body: {
      properties: {
        hs_title: input.quoteConfig.name,
        hs_expiration_date: expiration.toISOString(),
        pricer_scenario_id: input.scenario.id,
        pricer_revision: String(input.scenario.revision),
      },
      associations: [
        {
          to: { id: input.scenario.hubspotDealId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 64 }], // Quote → Deal
        },
      ],
    },
    correlationId: input.correlationId,
  });

  const row = await input.persistence.createHubSpotQuote({
    scenarioId: input.scenario.id,
    revision: input.scenario.revision,
    hubspotQuoteId: quoteRes.id,
    publishState: HubSpotPublishState.PUBLISHING,
  });

  // Step 3: create each line item + associate to quote
  for (const li of input.lineItems) {
    const liRes = await hubspotFetch<{ id: string }>({
      method: 'POST',
      path: '/crm/v3/objects/line_items',
      body: { properties: li.properties },
      correlationId: input.correlationId,
    });
    await hubspotFetch({
      method: 'PUT',
      path: `/crm/v3/objects/line_items/${liRes.id}/associations/quotes/${quoteRes.id}`,
      body: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 286 }], // Line Item → Quote
      correlationId: input.correlationId,
    });
  }

  // Step 4: transition to publishable (fetch shareable URL)
  const publishedRes = await hubspotFetch<{ properties: { hs_quote_link?: string } }>({
    method: 'PATCH',
    path: `/crm/v3/objects/quotes/${quoteRes.id}`,
    body: { properties: { hs_status: 'APPROVAL_NOT_NEEDED' } },
    correlationId: input.correlationId,
  });

  const shareableUrl = publishedRes.properties.hs_quote_link ?? null;

  await input.persistence.updatePublishState(row.id, HubSpotPublishState.PUBLISHED, {
    shareableUrl: shareableUrl ?? undefined,
    publishedAt: input.now(),
  });

  // Step 5: supersede prior revision (if any)
  const prior = await input.persistence.findPriorRevision(input.scenario.id, input.scenario.revision);
  if (prior) {
    await input.persistence.markSuperseded(prior.id, row.id);
    await hubspotFetch({
      method: 'PATCH',
      path: `/crm/v3/objects/quotes/${prior.hubspotQuoteId}`,
      body: { properties: { pricer_supersedes: quoteRes.id } },
      correlationId: input.correlationId,
    });
  }

  return { hubspotQuoteId: quoteRes.id, shareableUrl };
}
```

**Note on `associationTypeId` values:** HubSpot's standard associations have fixed type IDs. Quote→Deal is typically 64, Line Item→Quote is 286. Confirm against the HubSpot API docs (or via `GET /crm/v4/associations/definitions/quote/deal`) if the runtime fails; update the constants accordingly.

**Note on `hs_status = APPROVAL_NOT_NEEDED`:** this is HubSpot's enum for "quote ready to send without extra approval inside HubSpot." If the portal has approval-step policies configured at the HubSpot level, this value may be different; revisit during Phase 2b smoke testing.

- [ ] **Step 7.3: Run + commit**

```bash
npm test -- lib/hubspot/quote/publish.test.ts
git add lib/hubspot/quote/publish.ts lib/hubspot/quote/publish.test.ts
git commit -m "feat(hubspot): publish state machine (create quote + line items + associations + supersede)"
```

---

## Task 8: Webhook signature verification

**Files:**
- Create: `lib/hubspot/webhooks/verify.ts`
- Create: `lib/hubspot/webhooks/verify.test.ts`

HubSpot Signature v3: the signature is an HMAC-SHA-256 of `method + URI + body + timestamp` using the app's client secret, base64-encoded. Required headers: `X-HubSpot-Signature-V3`, `X-HubSpot-Request-Timestamp`. Requests older than 5 minutes must be rejected to prevent replay.

- [ ] **Step 8.1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyHubSpotSignatureV3 } from './verify';

const SECRET = 'client-secret';

function sign(method: string, uri: string, body: string, timestamp: string): string {
  const raw = method + uri + body + timestamp;
  return createHmac('sha256', SECRET).update(raw).digest('base64');
}

describe('verifyHubSpotSignatureV3', () => {
  it('returns true for a valid signature within window', () => {
    const timestamp = String(Date.now());
    const body = '{"foo":"bar"}';
    const signature = sign('POST', 'https://example.com/hooks', body, timestamp);
    expect(
      verifyHubSpotSignatureV3({
        method: 'POST',
        url: 'https://example.com/hooks',
        rawBody: body,
        timestamp,
        signature,
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it('returns false when signature is tampered', () => {
    const timestamp = String(Date.now());
    const body = '{"foo":"bar"}';
    expect(
      verifyHubSpotSignatureV3({
        method: 'POST',
        url: 'https://example.com/hooks',
        rawBody: body,
        timestamp,
        signature: 'notavalidsignature',
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it('returns false when timestamp is > 5 minutes old (replay)', () => {
    const timestamp = String(Date.now() - 6 * 60 * 1000);
    const body = '{}';
    const signature = sign('POST', 'https://example.com/hooks', body, timestamp);
    expect(
      verifyHubSpotSignatureV3({
        method: 'POST',
        url: 'https://example.com/hooks',
        rawBody: body,
        timestamp,
        signature,
        secret: SECRET,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 8.2: Implement**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE_MS = 5 * 60 * 1000;

export interface VerifyInput {
  method: string;
  url: string;
  rawBody: string;
  timestamp: string;
  signature: string;
  secret: string;
}

export function verifyHubSpotSignatureV3(input: VerifyInput): boolean {
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > MAX_AGE_MS) return false;

  const raw = input.method + input.url + input.rawBody + input.timestamp;
  const expected = createHmac('sha256', input.secret).update(raw).digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(input.signature, 'base64');
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(expected, provided);
}
```

- [ ] **Step 8.3: Run + commit**

```bash
npm test -- lib/hubspot/webhooks/verify.test.ts
git add lib/hubspot/webhooks/verify.ts lib/hubspot/webhooks/verify.test.ts
git commit -m "feat(hubspot): signature v3 verification for webhook endpoints"
```

---

## Task 9: Webhook event processor

**Files:**
- Create: `lib/hubspot/webhooks/process.ts`
- Create: `lib/hubspot/webhooks/process.test.ts`

- [ ] **Step 9.1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEvent } from './process';

const mockQuoteRepo = {
  recordTerminalStatus: vi.fn(),
  recordDealOutcome: vi.fn(),
};
const mockEventRepo = {
  findById: vi.fn(),
  markProcessed: vi.fn(),
  markFailed: vi.fn(),
};

describe('processEvent', () => {
  beforeEach(() => {
    Object.values(mockQuoteRepo).forEach((f) => f.mockReset());
    Object.values(mockEventRepo).forEach((f) => f.mockReset());
  });

  it('skips already-processed events', async () => {
    mockEventRepo.findById.mockResolvedValue({ id: 'e1', processedAt: new Date() });
    await processEvent('e1', { quoteRepo: mockQuoteRepo, eventRepo: mockEventRepo } as any);
    expect(mockQuoteRepo.recordTerminalStatus).not.toHaveBeenCalled();
    expect(mockEventRepo.markProcessed).not.toHaveBeenCalled();
  });

  it('quote.propertyChange with terminal status updates quote + marks processed', async () => {
    mockEventRepo.findById.mockResolvedValue({
      id: 'e1',
      processedAt: null,
      subscriptionType: 'quote.propertyChange',
      objectType: 'quote',
      objectId: 'hs-q-1',
      payload: { propertyName: 'hs_status', propertyValue: 'ACCEPTED', occurredAt: '2026-04-23T00:00:00Z' },
    });
    await processEvent('e1', { quoteRepo: mockQuoteRepo, eventRepo: mockEventRepo } as any);
    expect(mockQuoteRepo.recordTerminalStatus).toHaveBeenCalledWith('hs-q-1', 'ACCEPTED', expect.any(Date));
    expect(mockEventRepo.markProcessed).toHaveBeenCalledWith('e1');
  });

  it('non-terminal quote status change is a no-op for the quote repo but still marks processed', async () => {
    mockEventRepo.findById.mockResolvedValue({
      id: 'e1',
      processedAt: null,
      subscriptionType: 'quote.propertyChange',
      objectType: 'quote',
      objectId: 'hs-q-1',
      payload: { propertyName: 'hs_status', propertyValue: 'SENT' },
    });
    await processEvent('e1', { quoteRepo: mockQuoteRepo, eventRepo: mockEventRepo } as any);
    expect(mockQuoteRepo.recordTerminalStatus).not.toHaveBeenCalled();
    expect(mockEventRepo.markProcessed).toHaveBeenCalled();
  });

  it('deal.propertyChange dealstage Won → recordDealOutcome', async () => {
    mockEventRepo.findById.mockResolvedValue({
      id: 'e2',
      processedAt: null,
      subscriptionType: 'deal.propertyChange',
      objectType: 'deal',
      objectId: 'hs-d-1',
      payload: { propertyName: 'dealstage', propertyValue: 'closedwon', occurredAt: '2026-04-23T00:00:00Z', pricerScenarioId: 's1' },
    });
    await processEvent('e2', { quoteRepo: mockQuoteRepo, eventRepo: mockEventRepo } as any);
    expect(mockQuoteRepo.recordDealOutcome).toHaveBeenCalledWith('s1', 'WON', expect.any(Date));
  });

  it('markFailed on error, leaves processedAt null', async () => {
    mockEventRepo.findById.mockResolvedValue({
      id: 'e3',
      processedAt: null,
      subscriptionType: 'quote.propertyChange',
      objectType: 'quote',
      objectId: 'hs-q-1',
      payload: { propertyName: 'hs_status', propertyValue: 'ACCEPTED' },
    });
    mockQuoteRepo.recordTerminalStatus.mockRejectedValue(new Error('DB down'));
    await processEvent('e3', { quoteRepo: mockQuoteRepo, eventRepo: mockEventRepo } as any);
    expect(mockEventRepo.markFailed).toHaveBeenCalledWith('e3', 'DB down');
    expect(mockEventRepo.markProcessed).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 9.2: Implement**

```ts
import type { HubSpotQuoteRepository } from '@/lib/db/repositories/hubspotQuote';
import type { HubSpotWebhookEventRepository } from '@/lib/db/repositories/hubspotWebhookEvent';

const TERMINAL_QUOTE_STATUSES = new Set(['ACCEPTED', 'DECLINED', 'EXPIRED', 'REJECTED']);
const WON_STAGES = new Set(['closedwon']);
const LOST_STAGES = new Set(['closedlost']);

export interface ProcessDeps {
  quoteRepo: Pick<HubSpotQuoteRepository, 'recordTerminalStatus' | 'recordDealOutcome'>;
  eventRepo: Pick<HubSpotWebhookEventRepository, 'findById' | 'markProcessed' | 'markFailed'>;
}

export async function processEvent(eventId: string, deps: ProcessDeps): Promise<void> {
  const event = await deps.eventRepo.findById(eventId);
  if (!event) return;
  if (event.processedAt) return;

  try {
    const payload = event.payload as Record<string, unknown>;

    if (event.subscriptionType === 'quote.propertyChange' && payload.propertyName === 'hs_status') {
      const status = String(payload.propertyValue ?? '').toUpperCase();
      if (TERMINAL_QUOTE_STATUSES.has(status)) {
        const at = payload.occurredAt ? new Date(String(payload.occurredAt)) : new Date();
        await deps.quoteRepo.recordTerminalStatus(event.objectId, status, at);
      }
    } else if (event.subscriptionType === 'deal.propertyChange' && payload.propertyName === 'dealstage') {
      const stage = String(payload.propertyValue ?? '').toLowerCase();
      let outcome: 'WON' | 'LOST' | null = null;
      if (WON_STAGES.has(stage)) outcome = 'WON';
      else if (LOST_STAGES.has(stage)) outcome = 'LOST';

      if (outcome && payload.pricerScenarioId) {
        const at = payload.occurredAt ? new Date(String(payload.occurredAt)) : new Date();
        await deps.quoteRepo.recordDealOutcome(String(payload.pricerScenarioId), outcome, at);
      }
    }

    await deps.eventRepo.markProcessed(eventId);
  } catch (err) {
    await deps.eventRepo.markFailed(eventId, err instanceof Error ? err.message : String(err));
  }
}
```

- [ ] **Step 9.3: Run + commit**

```bash
npm test -- lib/hubspot/webhooks/process.test.ts
git add lib/hubspot/webhooks/process.ts lib/hubspot/webhooks/process.test.ts
git commit -m "feat(hubspot): idempotent webhook event processor for terminal states"
```

---

## Task 10: Quote webhook route

**Files:**
- Create: `app/api/hubspot/webhooks/quote/route.ts`
- Create: `app/api/hubspot/webhooks/quote/route.test.ts`

- [ ] **Step 10.1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/hubspot/webhooks/verify', () => ({
  verifyHubSpotSignatureV3: vi.fn(() => true),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {},
}));
const persistMock = vi.fn();
vi.mock('@/lib/db/repositories/hubspotWebhookEvent', () => ({
  HubSpotWebhookEventRepository: class {
    persist = persistMock;
  },
}));

describe('POST /api/hubspot/webhooks/quote', () => {
  beforeEach(() => {
    persistMock.mockReset();
    persistMock.mockResolvedValue({ id: 'evt-row-1' });
    process.env.HUBSPOT_WEBHOOK_SECRET = 'secret';
    process.env.HUBSPOT_APP_ID = '37357889';
  });

  it('returns 200 and persists the event', async () => {
    const body = JSON.stringify([
      {
        eventId: 'e1',
        subscriptionType: 'quote.propertyChange',
        objectId: 'hs-q-1',
        propertyName: 'hs_status',
        propertyValue: 'ACCEPTED',
        sourceId: 999, // not our app
        occurredAt: 1713873600000,
      },
    ]);
    const req = new Request('http://localhost/api/hubspot/webhooks/quote', {
      method: 'POST',
      headers: {
        'x-hubspot-signature-v3': 'sig',
        'x-hubspot-request-timestamp': String(Date.now()),
      },
      body,
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(persistMock).toHaveBeenCalled();
  });

  it('drops events where sourceId matches HUBSPOT_APP_ID', async () => {
    const body = JSON.stringify([
      {
        eventId: 'e1',
        subscriptionType: 'quote.propertyChange',
        objectId: 'hs-q-1',
        sourceId: 37357889,
      },
    ]);
    const req = new Request('http://localhost/api/hubspot/webhooks/quote', {
      method: 'POST',
      headers: {
        'x-hubspot-signature-v3': 'sig',
        'x-hubspot-request-timestamp': String(Date.now()),
      },
      body,
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(persistMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 10.2: Implement**

```ts
import { NextResponse } from 'next/server';
import { verifyHubSpotSignatureV3 } from '@/lib/hubspot/webhooks/verify';
import { HubSpotWebhookEventRepository } from '@/lib/db/repositories/hubspotWebhookEvent';
import { HubSpotQuoteRepository } from '@/lib/db/repositories/hubspotQuote';
import { processEvent } from '@/lib/hubspot/webhooks/process';
import { prisma } from '@/lib/db/client';

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.HUBSPOT_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'webhook secret not configured' }, { status: 500 });

  const signature = req.headers.get('x-hubspot-signature-v3') ?? '';
  const timestamp = req.headers.get('x-hubspot-request-timestamp') ?? '';
  const rawBody = await req.text();

  // The URL HubSpot signed must match this endpoint's public URL. The Railway URL
  // is authoritative (we may see req.url as a localhost/rewrite behind the load balancer).
  const publicUrl = process.env.HUBSPOT_WEBHOOK_URL_QUOTE
    ?? 'https://ninjapricer-production.up.railway.app/api/hubspot/webhooks/quote';

  const ok = verifyHubSpotSignatureV3({
    method: 'POST',
    url: publicUrl,
    rawBody,
    timestamp,
    signature,
    secret,
  });
  if (!ok) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });

  let events: Array<Record<string, unknown>>;
  try {
    events = JSON.parse(rawBody);
    if (!Array.isArray(events)) events = [events as Record<string, unknown>];
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const ourAppId = process.env.HUBSPOT_APP_ID ? Number(process.env.HUBSPOT_APP_ID) : null;
  const eventRepo = new HubSpotWebhookEventRepository(prisma);
  const quoteRepo = new HubSpotQuoteRepository(prisma);

  for (const ev of events) {
    if (ourAppId && ev.sourceId === ourAppId) continue; // echo filter

    const row = await eventRepo.persist({
      hubspotEventId: String(ev.eventId),
      subscriptionType: String(ev.subscriptionType ?? 'quote.propertyChange'),
      objectType: 'quote',
      objectId: String(ev.objectId ?? ''),
      payload: ev as never,
    });

    setImmediate(() => {
      processEvent(row.id, { eventRepo, quoteRepo }).catch(() => {
        // processing errors are already recorded via markFailed inside processEvent
      });
    });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
```

- [ ] **Step 10.3: Run + commit**

```bash
npm test -- app/api/hubspot/webhooks/quote/route.test.ts
git add app/api/hubspot/webhooks/quote
git commit -m "feat(hubspot): quote webhook route (signature + echo filter + persist + enqueue)"
```

---

## Task 11: Deal webhook route

**Files:**
- Create: `app/api/hubspot/webhooks/deal/route.ts`
- Create: `app/api/hubspot/webhooks/deal/route.test.ts`

Implement exactly like Task 10 but with `objectType: 'deal'` and `HUBSPOT_WEBHOOK_URL_DEAL` env override. Subscription types handled: `deal.propertyChange` (dealstage for terminal outcomes in 2b). Approval-status handling is added in Phase 2c.

- [ ] **Step 11.1: Copy-adapt from Task 10**

Create `app/api/hubspot/webhooks/deal/route.ts` mirroring `/quote/route.ts` with these changes:
- Default webhook URL: `https://ninjapricer-production.up.railway.app/api/hubspot/webhooks/deal`
- `objectType: 'deal'`
- `subscriptionType` fallback to `'deal.propertyChange'`
- Expected payload includes `dealstage` property changes and a `pricer_scenario_id` property from the Deal record

- [ ] **Step 11.2: Copy-adapt the test from Task 10**

Test file at `app/api/hubspot/webhooks/deal/route.test.ts`; adjust URL + event subscriptionType; assert 200 happy path + sourceId filtering.

- [ ] **Step 11.3: Commit**

```bash
git add app/api/hubspot/webhooks/deal
git commit -m "feat(hubspot): deal webhook route for terminal-state outcomes"
```

---

## Task 12: MCP tool — `link_scenario_to_hubspot_deal`

**Files:**
- Create: `lib/mcp/tools/hubspotQuote.ts` (grows across Tasks 12–16)
- Create: `lib/mcp/tools/hubspotQuote.test.ts`

- [ ] **Step 12.1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { linkScenarioToHubspotDealTool } from './hubspotQuote';

describe('link_scenario_to_hubspot_deal', () => {
  it('requires sales or admin scope (not requiresAdmin)', () => {
    expect(linkScenarioToHubspotDealTool.requiresAdmin).toBe(false);
    expect(linkScenarioToHubspotDealTool.isWrite).toBe(true);
  });

  it('validates input schema', () => {
    expect(() => linkScenarioToHubspotDealTool.inputSchema.parse({})).toThrow();
    expect(() =>
      linkScenarioToHubspotDealTool.inputSchema.parse({ scenarioId: 's1', hubspotDealId: 'd1' }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 12.2: Implement**

```ts
import { z } from 'zod';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { hubspotFetch } from '@/lib/hubspot/client';

const linkInput = z.object({ scenarioId: z.string().min(1), hubspotDealId: z.string().min(1) }).strict();

export const linkScenarioToHubspotDealTool: ToolDefinition<z.infer<typeof linkInput>, { ok: true }> = {
  name: 'link_scenario_to_hubspot_deal',
  description:
    'Link a pricer scenario to an existing HubSpot Deal. Validates the deal exists before writing. Returns { ok: true }.',
  inputSchema: linkInput,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (_ctx, input) => {
    // Validate deal exists
    await hubspotFetch({
      method: 'GET',
      path: `/crm/v3/objects/deals/${input.hubspotDealId}`,
      correlationId: `link-${Date.now()}`,
    });
    await prisma.scenario.update({
      where: { id: input.scenarioId },
      data: { hubspotDealId: input.hubspotDealId },
    });
    return { ok: true };
  },
};
```

- [ ] **Step 12.3: Run tests**

```bash
npm test -- lib/mcp/tools/hubspotQuote.test.ts
```
Expected: both tests PASS.

- [ ] **Step 12.4: Commit**

```bash
git add lib/mcp/tools/hubspotQuote.ts lib/mcp/tools/hubspotQuote.test.ts
git commit -m "feat(mcp): link_scenario_to_hubspot_deal tool"
```

---

## Task 13: MCP tool — `create_hubspot_deal_for_scenario`

**Files:**
- Modify: `lib/mcp/tools/hubspotQuote.ts`
- Modify: `lib/mcp/tools/hubspotQuote.test.ts`

Basic dedupe against HubSpot: search by contact email AND company domain. If matches found and caller didn't set `forceCreate: true`, return `{ matches: [...], created: false }`. Otherwise create Deal + Contact + Company and associate.

- [ ] **Step 13.1: Test + implement**

Test covers:
- input schema accepts required fields (`scenarioId`, `dealName`, `contactEmail` OR `companyDomain`)
- when HubSpot returns matches and `forceCreate` is false, tool returns matches without creating
- when no matches (or forceCreate true), tool creates Deal + Contact + Company + links to scenario

Implementation uses `/crm/v3/objects/contacts/search` (filter by email) and `/crm/v3/objects/companies/search` (filter by domain). For create: POST to `/crm/v3/objects/deals`, `/crm/v3/objects/contacts`, `/crm/v3/objects/companies`, then associate with type IDs (Deal→Contact 3, Deal→Company 5).

Write the tool definition following Task 12's pattern. Export as `createHubspotDealForScenarioTool`.

- [ ] **Step 13.2: Commit**

```bash
git add lib/mcp/tools/hubspotQuote.ts lib/mcp/tools/hubspotQuote.test.ts
git commit -m "feat(mcp): create_hubspot_deal_for_scenario with basic dedupe"
```

---

## Task 14: MCP tool — `publish_scenario_to_hubspot`

**Files:**
- Modify: `lib/mcp/tools/hubspotQuote.ts`
- Modify: `lib/mcp/tools/hubspotQuote.test.ts`

Thin wrapper that:
1. Loads the scenario from Prisma with its line items / bundles
2. Builds the `PublishInput` shape (queries engine for line data; calls `scenarioToHubSpotLineItems`)
3. Constructs `PublishPersistence` from `HubSpotQuoteRepository`
4. Calls `publishScenarioToHubSpot`
5. Returns `{ hubspotQuoteId, shareableUrl, correlationId }`

Exports `publishScenarioToHubspotTool`. Handler catches `MissingDealLinkError` and `UnresolvedHardRailOverrideError` and converts them to structured tool errors the caller can surface.

- [ ] **Step 14.1: Test + implement + commit**

Test the happy path against a mocked `hubspotFetch` and seeded scenario.

Commit: `feat(mcp): publish_scenario_to_hubspot tool`

---

## Task 15: MCP tools — `check_publish_status` + `supersede_hubspot_quote`

**Files:**
- Modify: `lib/mcp/tools/hubspotQuote.ts`

- **`check_publish_status`**: input `{ scenarioId }`, returns `{ publishState, hubspotQuoteId?, shareableUrl?, lastStatus?, dealOutcome?, revision }` from the latest `HubSpotQuote` row for that scenario.
- **`supersede_hubspot_quote`**: input `{ scenarioId }`. Reads latest revision for the scenario, increments by 1, calls `publishScenarioToHubSpot` with the new revision. Output same shape as publish.

Tests: input schemas + happy-path against mocked Prisma.

```bash
git add lib/mcp/tools/hubspotQuote.ts lib/mcp/tools/hubspotQuote.test.ts
git commit -m "feat(mcp): check_publish_status + supersede_hubspot_quote tools"
```

---

## Task 16: Register Phase 2b MCP tools in route

**Files:**
- Modify: `app/api/mcp/route.ts`

- [ ] **Step 16.1: Add import + spread**

Near the existing HubSpot catalog tools import block, add:

```ts
import {
  linkScenarioToHubspotDealTool,
  createHubspotDealForScenarioTool,
  publishScenarioToHubspotTool,
  checkPublishStatusTool,
  supersedeHubspotQuoteTool,
} from '@/lib/mcp/tools/hubspotQuote';

const hubspotQuoteTools = [
  linkScenarioToHubspotDealTool,
  createHubspotDealForScenarioTool,
  publishScenarioToHubspotTool,
  checkPublishStatusTool,
  supersedeHubspotQuoteTool,
] as ToolDefinition<unknown, unknown>[];
```

Add `...hubspotQuoteTools` to the `tools` array passed to `createMcpServer`.

- [ ] **Step 16.2: Confirm build**

```bash
npm run build
```
Expected: clean compile.

- [ ] **Step 16.3: Commit**

```bash
git add app/api/mcp/route.ts
git commit -m "feat(mcp): register Phase 2b HubSpot quote tools"
```

---

## Task 17: Admin UI — `/admin/hubspot/published-quotes`

**Files:**
- Create: `app/admin/hubspot/published-quotes/page.tsx`

- [ ] **Step 17.1: Implement page**

Server component. Calls `HubSpotQuoteRepository.listRecent(200)`, renders a table: scenario name (via `scenario` relation), revision, publishState, HubSpot quote URL, lastStatus, dealOutcome, supersede chain. Gate with `await requireAdmin()`. Add `export const dynamic = 'force-dynamic'`.

- [ ] **Step 17.2: Commit**

```bash
git add app/admin/hubspot/published-quotes
git commit -m "feat(hubspot): admin published-quotes log page"
```

---

## Task 18: Admin UI — `/admin/hubspot/webhook-events`

**Files:**
- Create: `app/admin/hubspot/webhook-events/page.tsx`
- Create: `app/admin/hubspot/webhook-events/RetryButton.tsx`
- Modify: `app/admin/hubspot/actions.ts` (add `retryWebhookEventAction`)

- [ ] **Step 18.1: Server action**

Add to `app/admin/hubspot/actions.ts`:

```ts
export async function retryWebhookEventAction(input: { eventId: string }) {
  await requireAdmin();
  const eventRepo = new HubSpotWebhookEventRepository(prisma);
  const quoteRepo = new HubSpotQuoteRepository(prisma);
  await processEvent(input.eventId, { eventRepo, quoteRepo });
  revalidatePath('/admin/hubspot/webhook-events');
}
```

Imports adjusted accordingly.

- [ ] **Step 18.2: Retry button client component**

```tsx
'use client';
import { useTransition } from 'react';
import { retryWebhookEventAction } from '../actions';

export function RetryButton({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs px-2 py-1 border rounded disabled:opacity-50"
      onClick={() => startTransition(async () => { await retryWebhookEventAction({ eventId }); })}
    >
      {pending ? '…' : 'Retry'}
    </button>
  );
}
```

- [ ] **Step 18.3: Page**

Server component: `HubSpotWebhookEventRepository.listRecent(200)`. Table columns: received-at, subscriptionType, objectType, objectId, processedAt, error. If `processedAt === null` and `processingError` is set, show the `<RetryButton>`.

- [ ] **Step 18.4: Commit**

```bash
git add app/admin/hubspot/webhook-events app/admin/hubspot/actions.ts
git commit -m "feat(hubspot): admin webhook-events log + retry"
```

---

## Task 19: Scenario page — HubSpot section

**Files:**
- Modify: `app/scenarios/[id]/page.tsx` (or equivalent scenario-detail page)
- Modify: `app/scenarios/[id]/actions.ts` (add link + publish server actions)

- [ ] **Step 19.1: Read existing scenario page**

Open the scenario detail page. Note the existing section layout pattern.

- [ ] **Step 19.2: Add server actions**

Add to `actions.ts`:

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/client';
import { publishScenarioToHubSpot } from '@/lib/hubspot/quote/publish';
// ... build PublishInput from scenario state, call publishScenarioToHubSpot
export async function linkScenarioDealAction(input: { scenarioId: string; hubspotDealId: string }) {
  // same as the MCP tool handler — update Scenario.hubspotDealId
}
export async function publishScenarioAction(input: { scenarioId: string }) {
  // same as publish_scenario_to_hubspot tool handler
}
```

Reuse the service-layer logic — don't duplicate the publish orchestration.

- [ ] **Step 19.3: Add HubSpot section component**

Client component inside the scenario page. Four states:
- **No hubspotDealId**: show input + "Link Deal" button (server action `linkScenarioDealAction`). Also a "Create new Deal" link to the collision-free flow (Phase 4 polish — for now, just the link action).
- **Linked, no quote yet**: show "Publish to HubSpot" button + rail warning summary.
- **Published**: show quote link, revision, status, "Revise" button (calls `supersede_hubspot_quote` via `publishScenarioAction` with incremented revision).
- **Unresolved hard-rail overrides**: disable publish with message "Approval flow required — configure HubSpot Workflow (Phase 2c) before publishing scenarios with rail overrides".

- [ ] **Step 19.4: Commit**

```bash
git add app/scenarios/[id]
git commit -m "feat(hubspot): scenario page HubSpot section (link deal + publish + status)"
```

---

## Task 20: HubSpot Developer Project — add webhook subscriptions + deployment runbook

**Files:**
- Modify: `hubspot-project/src/app/app-hsmeta.json`
- Create: `docs/superpowers/runbooks/hubspot-phase-2b.md`

- [ ] **Step 20.1: Update `app-hsmeta.json`**

Open `hubspot-project/src/app/app-hsmeta.json`. Under the `config` object, add a webhooks block:

```json
"webhooks": {
  "subscriptions": [
    {
      "objectType": "quote",
      "eventType": "quote.propertyChange",
      "propertyName": "hs_status",
      "endpoint": "https://ninjapricer-production.up.railway.app/api/hubspot/webhooks/quote"
    },
    {
      "objectType": "deal",
      "eventType": "deal.propertyChange",
      "propertyName": "dealstage",
      "endpoint": "https://ninjapricer-production.up.railway.app/api/hubspot/webhooks/deal"
    }
  ]
}
```

(Confirm exact manifest syntax against HubSpot's current platform 2026.03 schema — `hs project validate` will flag issues. Webhook configuration may require the `webhooks` feature to be added via `hs project add` rather than hand-edited.)

- [ ] **Step 20.2: Write runbook**

Create `docs/superpowers/runbooks/hubspot-phase-2b.md`:

```md
# Phase 2b — Deployment + Smoke Test

## Prerequisites
- Phase 2a deployed (Product/Bundle have description + sku).
- Classic/Developer-Project private app token configured as `HUBSPOT_ACCESS_TOKEN` in Railway.

## Deploy steps

1. Add `HUBSPOT_WEBHOOK_SECRET` to Railway env. The value is the Developer Project app's **Client Secret** (visible on the app's Auth tab).
2. Add `HUBSPOT_APP_ID=37357889` to Railway env (used for the echo filter).
3. From `hubspot-project/` run `hs project upload`. Build + deploy; then open the Distribution tab and click **Reinstall** to re-approve the new webhook-related scopes (if any).
4. Confirm webhook subscriptions are active in HubSpot: Settings → Integrations → Private Apps → Ninja Pricer → Webhooks tab.

## Smoke test (end-to-end)

1. Link a pricer scenario to a real HubSpot Deal via `/scenarios/<id>` → HubSpot section.
2. Click **Publish to HubSpot**. Verify:
   - HubSpot Deal now has an associated Quote.
   - Pricer's `/admin/hubspot/published-quotes` shows a new row with state `PUBLISHED` and a shareable URL.
3. In HubSpot, open the Quote and transition its `hs_status` to a terminal state (e.g., manually set to `ACCEPTED`).
4. Within ~5 seconds, pricer's `/admin/hubspot/webhook-events` shows a new event with `processedAt` set; the quote row on `/admin/hubspot/published-quotes` shows `lastStatus = ACCEPTED`.
5. Move the Deal to `closedwon`. Same verification for `dealOutcome = WON`.

## Troubleshooting

- **401 from webhook endpoint:** signature mismatch. Confirm `HUBSPOT_WEBHOOK_SECRET` matches the app's **Client Secret** (not the access token). Confirm the URL HubSpot is calling matches `HUBSPOT_WEBHOOK_URL_QUOTE`/`HUBSPOT_WEBHOOK_URL_DEAL` (defaults to production Railway URL).
- **Event received but not processed:** check `/admin/hubspot/webhook-events`. Failed rows have `processingError` populated. Click **Retry** to re-process.
- **Quote publish fails with `MissingDealLinkError`:** link the scenario to a Deal first.
- **Quote publish fails with `UnresolvedHardRailOverrideError`:** scenario has hard-rail overrides. Phase 2c implements approval. For now, remove the override or adjust pricing to pass rails.
```

- [ ] **Step 20.3: Commit**

```bash
git add hubspot-project/src/app/app-hsmeta.json docs/superpowers/runbooks/hubspot-phase-2b.md
git commit -m "feat(hubspot): webhook subscriptions in app manifest + phase 2b runbook"
```

---

## Task 21: Final verification

- [ ] **Step 21.1: Run verification gates**

```bash
npm test
npm run test:integration
npm run lint
npm run format:check
npm run build
```

All must pass. Any lint/format fixes → commit with `chore(hubspot): phase 2b lint + format`.

- [ ] **Step 21.2: Spec coverage walkthrough**

Re-read the Phase 2 spec's "Publish Flow", "Round-Trip Webhooks", "Revision / Supersede", and "MCP Tools Added" sections. Verify each requirement has a task. Note any gaps in the commit summary if found. (Approval-flow items are expected to be uncovered — that's Phase 2c.)

---

## Self-Review Notes

- **Spec coverage (Phase 2b scope):**
  - HubSpotQuote + HubSpotWebhookEvent models ✓ (T1)
  - Publish state machine + supersede ✓ (T7)
  - Translator (hybrid-by-reason line items) ✓ (T6)
  - Bundle pricing (engine extraction, placeholder for catalog sync) ✓ (T4, T5)
  - Webhook signature verification ✓ (T8)
  - Webhook processor + echo filter ✓ (T9, T10, T11)
  - MCP tools: link, create-deal, publish, check-status, supersede ✓ (T12–T15)
  - Admin UI: published-quotes, webhook-events, scenario page section ✓ (T17–T19)
  - HubSpot project webhook subscriptions ✓ (T20)
- **Deferred to Phase 2c:** approval flow, HubSpotApprovalRequest model, deal webhook handling for `pricer_approval_status`. T7 explicitly rejects scenarios with unresolved hard-rail overrides so Phase 2b is safe to ship without approval.
- **Engine extraction risk (T4):** `computeBundleRolledUpMonthlyPrice` depends on the exact shape of `ComputeRequest` in `lib/engine/types.ts`. Read that file before implementing; the test fixture shapes will need to match the real interface.
- **HubSpot association type IDs (T7):** hardcoded 64 (quote→deal) and 286 (line_item→quote) per public docs. If these fail in smoke testing, query `GET /crm/v4/associations/definitions/<from>/<to>` to find the correct IDs and update the constants.
- **Webhook subscription manifest syntax (T20):** platform 2026.03 may require the `webhooks` feature to be added via `hs project add` rather than hand-edited. If `hs project upload` rejects the manifest, run `hs project add webhooks` from `hubspot-project/` and merge the generated config.
- **Existing scenarios/quote pages (T19):** the precise file paths depend on the current scenario admin page structure. Read before editing; adjust selectors.
