# HubSpot Phase 2c — Approval Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the hard-rail-override approval round-trip: pricer detects overrides → PATCHes HubSpot Deal `pricer_approval_status = pending` → HubSpot Workflow routes to a manager → manager decision writes back → pricer resumes publish (approved) or transitions scenario to `APPROVAL_REJECTED` (rejected).

**Architecture:** No new surfaces — everything extends what Phase 2b already built. `runPublishScenario` branches on `hasUnresolvedHardRailOverrides`: instead of throwing `UnresolvedHardRailOverrideError`, it writes a `HubSpotApprovalRequest`, PATCHes the Deal, and returns a `pending` outcome. The deal webhook (already deployed in 2b) gains a handler branch for `pricer_approval_status` property changes that resolves the request and re-enters publish on approve (or marks rejected on reject). HubSpot Workflow configuration is admin-side (runbook only).

**Tech Stack:** Next.js 14 (App Router), Prisma 6 + Postgres, Vitest. Extends existing HubSpot integration.

**Spec reference:** [docs/superpowers/specs/2026-04-22-hubspot-phase-2-publish-approval-webhooks-design.md — "Approval Flow" section](../specs/2026-04-22-hubspot-phase-2-publish-approval-webhooks-design.md)

---

## File Structure

**Created:**

```
lib/db/repositories/hubspotApprovalRequest.ts
lib/db/repositories/hubspotApprovalRequest.db.test.ts

lib/hubspot/approval/request.ts                    — writes approval request + PATCHes Deal
lib/hubspot/approval/request.test.ts
lib/hubspot/approval/resolve.ts                    — webhook-driven resolve (approved resumes publish; rejected marks scenario)
lib/hubspot/approval/resolve.test.ts

app/admin/hubspot/approval-requests/page.tsx       — admin list of pending/recent approval requests

docs/superpowers/runbooks/hubspot-phase-2c-workflow.md   — HubSpot Workflow configuration for the approval task
```

**Modified:**

```
prisma/schema.prisma                                — HubSpotApprovalRequest model + HubSpotApprovalStatus enum
prisma/migrations/<ts>_hubspot_approval_request/migration.sql

lib/hubspot/quote/publishService.ts                 — replace UnresolvedHardRailOverrideError throw with approval-request branch
lib/hubspot/quote/publishService.test.ts            — new test for approval branch + resume

lib/hubspot/webhooks/process.ts                     — handle deal.propertyChange pricer_approval_status
lib/hubspot/webhooks/process.test.ts                — new tests for approve/reject paths

app/scenarios/[id]/hubspot/HubSpotSection.tsx       — PENDING_APPROVAL + APPROVAL_REJECTED states
app/scenarios/[id]/hubspot/page.tsx                 — load HubSpotApprovalRequest for display

hubspot-project/src/app/app-hsmeta.json             — add crm.objects.owners.read scope
hubspot-project/src/app/webhooks/webhooks-hsmeta.json — add subscription on deal.pricer_approval_status

docs/superpowers/runbooks/hubspot-phase-2b.md       — add pointer to the new workflow runbook
```

---

## Task 1: Prisma schema — `HubSpotApprovalRequest` + enum

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1.1: Add `HubSpotApprovalStatus` enum**

In `prisma/schema.prisma`, near the other `HubSpot*` enums, add:

```prisma
enum HubSpotApprovalStatus {
  PENDING
  APPROVED
  REJECTED
}
```

- [ ] **Step 1.2: Add `HubSpotApprovalRequest` model**

Append near the other `HubSpot*` models:

```prisma
model HubSpotApprovalRequest {
  id                  String                  @id @default(cuid())
  scenarioId          String                  @unique
  hubspotDealId       String
  railViolations      Json
  submittedAt         DateTime                @default(now())
  status              HubSpotApprovalStatus   @default(PENDING)
  resolvedAt          DateTime?
  resolvedByUserId    String?
  resolvedByHubspotOwnerId String?

  scenario            Scenario                @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 1.3: Add the reverse relation on Scenario**

On the existing `Scenario` model, add:

```prisma
  hubspotApprovalRequest HubSpotApprovalRequest?
```

- [ ] **Step 1.4: Generate + apply migration**

```bash
npx prisma migrate dev --name hubspot_approval_request --create-only
# inspect the SQL — expect one CREATE TYPE + one CREATE TABLE
npx prisma migrate dev
```

- [ ] **Step 1.5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(hubspot): add HubSpotApprovalRequest model + HubSpotApprovalStatus enum"
```

---

## Task 2: `HubSpotApprovalRequest` repository

**Files:**

- Create: `lib/db/repositories/hubspotApprovalRequest.ts`
- Create: `lib/db/repositories/hubspotApprovalRequest.db.test.ts`

- [ ] **Step 2.1: Write failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient, HubSpotApprovalStatus, ProductKind } from '@prisma/client';
import { HubSpotApprovalRequestRepository } from './hubspotApprovalRequest';

const prisma = new PrismaClient();

async function seedScenario(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: 'approval-test@example.com' },
    create: { email: 'approval-test@example.com', role: 'ADMIN' },
    update: {},
  });
  const product = await prisma.product.create({
    data: { name: `Notes-${Date.now()}`, kind: ProductKind.SAAS_USAGE, isActive: true },
  });
  const scenario = await prisma.scenario.create({
    data: {
      name: `Approval Test ${Date.now()}`,
      customerName: 'Acme',
      ownerId: user.id,
      contractMonths: 12,
    },
  });
  void product;
  return scenario.id;
}

describe('HubSpotApprovalRequestRepository', () => {
  const repo = new HubSpotApprovalRequestRepository(prisma);

  beforeEach(async () => {
    await prisma.hubSpotApprovalRequest.deleteMany();
    await prisma.scenario.deleteMany();
    await prisma.product.deleteMany();
  });

  it('create persists a pending row', async () => {
    const scenarioId = await seedScenario();
    const row = await repo.create({
      scenarioId,
      hubspotDealId: 'hs-d-1',
      railViolations: [
        { productId: 'p1', kind: 'MIN_MARGIN_PCT', measuredValue: '0.15', threshold: '0.25' },
      ],
    });
    expect(row.status).toBe('PENDING');
    expect(row.hubspotDealId).toBe('hs-d-1');
  });

  it('upsert is idempotent on scenarioId (same scenario republished keeps one row)', async () => {
    const scenarioId = await seedScenario();
    const first = await repo.upsert({
      scenarioId,
      hubspotDealId: 'hs-d-1',
      railViolations: [],
    });
    const second = await repo.upsert({
      scenarioId,
      hubspotDealId: 'hs-d-1',
      railViolations: [{ updated: true }],
    });
    expect(second.id).toBe(first.id);
    const all = await prisma.hubSpotApprovalRequest.findMany({ where: { scenarioId } });
    expect(all.length).toBe(1);
  });

  it('findByScenarioId returns the row or null', async () => {
    const scenarioId = await seedScenario();
    expect(await repo.findByScenarioId(scenarioId)).toBeNull();
    await repo.create({ scenarioId, hubspotDealId: 'hs-d-1', railViolations: [] });
    const found = await repo.findByScenarioId(scenarioId);
    expect(found?.scenarioId).toBe(scenarioId);
  });

  it('findByHubspotDealId returns most recent row for that deal', async () => {
    const scenarioId = await seedScenario();
    await repo.create({ scenarioId, hubspotDealId: 'hs-d-1', railViolations: [] });
    const found = await repo.findByHubspotDealId('hs-d-1');
    expect(found?.scenarioId).toBe(scenarioId);
  });

  it('resolve stamps resolution fields', async () => {
    const scenarioId = await seedScenario();
    const row = await repo.create({ scenarioId, hubspotDealId: 'hs-d-1', railViolations: [] });
    const updated = await repo.resolve(row.id, {
      status: HubSpotApprovalStatus.APPROVED,
      resolvedByHubspotOwnerId: 'owner-42',
    });
    expect(updated.status).toBe('APPROVED');
    expect(updated.resolvedAt).not.toBeNull();
    expect(updated.resolvedByHubspotOwnerId).toBe('owner-42');
  });
});
```

- [ ] **Step 2.2: Implement**

```ts
import type { PrismaClient, HubSpotApprovalRequest, Prisma } from '@prisma/client';
import { HubSpotApprovalStatus } from '@prisma/client';

export class HubSpotApprovalRequestRepository {
  constructor(private db: PrismaClient) {}

  async create(data: {
    scenarioId: string;
    hubspotDealId: string;
    railViolations: Prisma.InputJsonValue;
  }): Promise<HubSpotApprovalRequest> {
    return this.db.hubSpotApprovalRequest.create({ data });
  }

  async upsert(data: {
    scenarioId: string;
    hubspotDealId: string;
    railViolations: Prisma.InputJsonValue;
  }): Promise<HubSpotApprovalRequest> {
    return this.db.hubSpotApprovalRequest.upsert({
      where: { scenarioId: data.scenarioId },
      create: data,
      update: {
        hubspotDealId: data.hubspotDealId,
        railViolations: data.railViolations,
        status: HubSpotApprovalStatus.PENDING,
        submittedAt: new Date(),
        resolvedAt: null,
        resolvedByUserId: null,
        resolvedByHubspotOwnerId: null,
      },
    });
  }

  async findById(id: string): Promise<HubSpotApprovalRequest | null> {
    return this.db.hubSpotApprovalRequest.findUnique({ where: { id } });
  }

  async findByScenarioId(scenarioId: string): Promise<HubSpotApprovalRequest | null> {
    return this.db.hubSpotApprovalRequest.findUnique({ where: { scenarioId } });
  }

  async findByHubspotDealId(hubspotDealId: string): Promise<HubSpotApprovalRequest | null> {
    return this.db.hubSpotApprovalRequest.findFirst({
      where: { hubspotDealId },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async listPending(limit = 200): Promise<HubSpotApprovalRequest[]> {
    return this.db.hubSpotApprovalRequest.findMany({
      where: { status: HubSpotApprovalStatus.PENDING },
      orderBy: { submittedAt: 'desc' },
      take: limit,
    });
  }

  async listRecent(limit = 200): Promise<HubSpotApprovalRequest[]> {
    return this.db.hubSpotApprovalRequest.findMany({
      orderBy: { submittedAt: 'desc' },
      take: limit,
    });
  }

  async resolve(
    id: string,
    data: {
      status: HubSpotApprovalStatus;
      resolvedByUserId?: string;
      resolvedByHubspotOwnerId?: string;
    },
  ): Promise<HubSpotApprovalRequest> {
    return this.db.hubSpotApprovalRequest.update({
      where: { id },
      data: {
        status: data.status,
        resolvedAt: new Date(),
        resolvedByUserId: data.resolvedByUserId ?? null,
        resolvedByHubspotOwnerId: data.resolvedByHubspotOwnerId ?? null,
      },
    });
  }
}
```

- [ ] **Step 2.3: Run + commit**

```bash
npm run test:integration -- lib/db/repositories/hubspotApprovalRequest.db.test.ts
git add lib/db/repositories/hubspotApprovalRequest.ts lib/db/repositories/hubspotApprovalRequest.db.test.ts
git commit -m "feat(hubspot): HubSpotApprovalRequest repository"
```

---

## Task 3: Approval-request submission service

**Files:**

- Create: `lib/hubspot/approval/request.ts`
- Create: `lib/hubspot/approval/request.test.ts`

- [ ] **Step 3.1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as client from '../client';
import { submitApprovalRequest } from './request';

const fetchSpy = vi.spyOn(client, 'hubspotFetch');

const persistence = {
  upsertApprovalRequest: vi.fn(),
  updateQuotePublishState: vi.fn(),
  findOrCreateQuoteRow: vi.fn(),
};

describe('submitApprovalRequest', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
    Object.values(persistence).forEach((f) => f.mockReset());
  });

  it('PATCHes Deal pricer_approval_status=pending + pricer_margin_pct + pricer_scenario_id', async () => {
    fetchSpy.mockResolvedValue({});
    persistence.upsertApprovalRequest.mockResolvedValue({ id: 'req-1' });
    persistence.findOrCreateQuoteRow.mockResolvedValue({ id: 'q-row-1' });

    await submitApprovalRequest({
      scenarioId: 's1',
      hubspotDealId: 'd1',
      revision: 1,
      railViolations: [
        { productId: 'p1', kind: 'MIN_MARGIN_PCT', measuredValue: '0.15', threshold: '0.25' },
      ],
      marginPct: 0.22,
      persistence,
      correlationId: 'c1',
    } as any);

    expect(persistence.upsertApprovalRequest).toHaveBeenCalledWith({
      scenarioId: 's1',
      hubspotDealId: 'd1',
      railViolations: expect.any(Array),
    });
    expect(persistence.updateQuotePublishState).toHaveBeenCalledWith('q-row-1', 'PENDING_APPROVAL');

    const patchCall = fetchSpy.mock.calls.find(
      ([a]) => a.method === 'PATCH' && a.path.includes('/deals/d1'),
    );
    expect(patchCall).toBeTruthy();
    expect(patchCall![0].body).toEqual({
      properties: {
        pricer_approval_status: 'pending',
        pricer_margin_pct: '0.22',
        pricer_scenario_id: 's1',
      },
    });
  });
});
```

- [ ] **Step 3.2: Implement**

```ts
import { hubspotFetch } from '../client';
import { HubSpotPublishState } from '@prisma/client';

export interface ApprovalPersistence {
  upsertApprovalRequest(data: {
    scenarioId: string;
    hubspotDealId: string;
    railViolations: unknown;
  }): Promise<{ id: string }>;
  findOrCreateQuoteRow(data: { scenarioId: string; revision: number }): Promise<{ id: string }>;
  updateQuotePublishState(quoteRowId: string, state: HubSpotPublishState): Promise<void>;
}

export interface SubmitApprovalInput {
  scenarioId: string;
  hubspotDealId: string;
  revision: number;
  railViolations: Array<Record<string, unknown>>;
  marginPct: number;
  persistence: ApprovalPersistence;
  correlationId: string;
}

export async function submitApprovalRequest(
  input: SubmitApprovalInput,
): Promise<{ approvalRequestId: string }> {
  const req = await input.persistence.upsertApprovalRequest({
    scenarioId: input.scenarioId,
    hubspotDealId: input.hubspotDealId,
    railViolations: input.railViolations,
  });

  const quoteRow = await input.persistence.findOrCreateQuoteRow({
    scenarioId: input.scenarioId,
    revision: input.revision,
  });
  await input.persistence.updateQuotePublishState(
    quoteRow.id,
    HubSpotPublishState.PENDING_APPROVAL,
  );

  await hubspotFetch({
    method: 'PATCH',
    path: `/crm/v3/objects/deals/${input.hubspotDealId}`,
    body: {
      properties: {
        pricer_approval_status: 'pending',
        pricer_margin_pct: input.marginPct.toFixed(2),
        pricer_scenario_id: input.scenarioId,
      },
    },
    correlationId: input.correlationId,
  });

  return { approvalRequestId: req.id };
}
```

- [ ] **Step 3.3: Run + commit**

```bash
npm test -- lib/hubspot/approval/request.test.ts
git add lib/hubspot/approval/request.ts lib/hubspot/approval/request.test.ts
git commit -m "feat(hubspot): submitApprovalRequest writes approval intent + PATCHes Deal"
```

---

## Task 4: Extend `runPublishScenario` to branch on hard-rail overrides

**Files:**

- Modify: `lib/hubspot/quote/publishService.ts`
- Modify: `lib/hubspot/quote/publishService.test.ts`

In Phase 2b, `runPublishScenario` threw `UnresolvedHardRailOverrideError` when `computeResult.warnings` included a hard violation. Phase 2c changes this to:

1. If the `HubSpotApprovalRequest` for this scenario exists AND status is `APPROVED` → skip the threshold check (proceed to publish).
2. Else if hard-rail violations exist → call `submitApprovalRequest` and return `{ status: 'pending_approval', approvalRequestId }`.
3. Else → proceed to publish (existing path).

- [ ] **Step 4.1: Write tests — three branches**

Extend the existing test file. Three new tests:

```ts
it('approval-pending branch: hard-rail override with no approval → calls submitApprovalRequest and returns pending', async () => {
  // mock computeResult.warnings to include a hard violation
  // mock approvalRepo.findByScenarioId → null
  // spy submitApprovalRequest
  // expect runPublishScenario resolves with { status: 'pending_approval', approvalRequestId: ... }
  // expect HubSpot quote creation was NOT attempted
});

it('approved branch: hard-rail override but HubSpotApprovalRequest.status = APPROVED → proceeds to publish', async () => {
  // approvalRepo.findByScenarioId → { status: APPROVED }
  // expect HubSpot quote creation IS attempted (no submitApprovalRequest call)
});

it('rejected branch: hard-rail override and status = REJECTED → returns { status: "rejected" } without republishing', async () => {
  // approvalRepo.findByScenarioId → { status: REJECTED }
  // expect return shape reflects rejection
  // expect no submitApprovalRequest, no quote creation
});
```

Adjust the existing "rejects scenarios with unresolved hard-rail overrides" test → DELETE it (2c removes that error path from the service — the publish.ts state machine still throws, but the service layer now handles the approval branch before calling publish).

- [ ] **Step 4.2: Implement**

At the top of `runPublishScenario` (after scenario + computeResult are loaded), add the approval-aware branching:

```ts
import { HubSpotApprovalRequestRepository } from '@/lib/db/repositories/hubspotApprovalRequest';
import { submitApprovalRequest, type ApprovalPersistence } from '@/lib/hubspot/approval/request';
import { HubSpotApprovalStatus } from '@prisma/client';

// ... inside runPublishScenario, after computing hasHardOverrides:

const hasHardOverrides = computeResult.warnings.some((w) => w.severity === 'hard');
const approvalRepo = new HubSpotApprovalRequestRepository(prisma);

if (hasHardOverrides) {
  const existing = await approvalRepo.findByScenarioId(scenario.id);

  if (existing?.status === HubSpotApprovalStatus.REJECTED) {
    return { status: 'rejected' as const, approvalRequestId: existing.id };
  }

  if (existing?.status !== HubSpotApprovalStatus.APPROVED) {
    // Submit or re-submit approval request
    const approvalPersistence: ApprovalPersistence = {
      upsertApprovalRequest: async (d) => approvalRepo.upsert(d),
      findOrCreateQuoteRow: async ({ scenarioId, revision }) => {
        const existingRow = await quoteRepo.findByScenarioAndRevision(scenarioId, revision);
        if (existingRow) return { id: existingRow.id };
        // Draft row for the pending approval (no hubspotQuoteId yet)
        const created = await quoteRepo.create({
          scenarioId,
          revision,
          hubspotQuoteId: `pending-${scenarioId}-${revision}`, // placeholder; replaced when publish resumes
          publishState: HubSpotPublishState.DRAFT,
        });
        return { id: created.id };
      },
      updateQuotePublishState: async (id, state) => {
        await quoteRepo.updatePublishState(id, state);
      },
    };

    const marginPct = Number(computeResult.totals.marginPctNet ?? 0);
    const result = await submitApprovalRequest({
      scenarioId: scenario.id,
      hubspotDealId: scenario.hubspotDealId!,
      revision: nextRevision,
      railViolations: computeResult.warnings.filter((w) => w.severity === 'hard'),
      marginPct,
      persistence: approvalPersistence,
      correlationId,
    });
    return { status: 'pending_approval' as const, approvalRequestId: result.approvalRequestId };
  }
  // existing.status === APPROVED → fall through to normal publish path
}

// ... existing publish path (create HubSpotQuote via state machine)
```

**Note on `pending-*` placeholder `hubspotQuoteId`:** HubSpotQuote has a `@unique` on `hubspotQuoteId`. Using a synthetic string during PENDING_APPROVAL is acceptable because it only lives until publish resumes and creates the real one. Alternative: make `hubspotQuoteId` nullable in schema (requires migration). For this plan, use the synthetic placeholder; add a comment documenting the intent.

Return type of `runPublishScenario` expands to a discriminated union:

```ts
export type PublishServiceResult =
  | {
      status: 'published';
      hubspotQuoteId: string;
      shareableUrl: string | null;
      correlationId: string;
    }
  | { status: 'pending_approval'; approvalRequestId: string; correlationId: string }
  | { status: 'rejected'; approvalRequestId: string; correlationId: string };
```

Update every caller of `runPublishScenario` — the MCP handler and scenario actions — to switch on `status`.

- [ ] **Step 4.3: Run + commit**

```bash
npm test -- lib/hubspot/quote/publishService.test.ts
npm test -- lib/mcp/tools/hubspotQuote.test.ts  # update mocks for new return shape
git add lib/hubspot/quote/publishService.ts lib/hubspot/quote/publishService.test.ts \
  lib/mcp/tools/hubspotQuote.ts lib/mcp/tools/hubspotQuote.test.ts \
  app/scenarios/[id]/actions.ts
git commit -m "feat(hubspot): runPublishScenario branches on hard-rail overrides into approval flow"
```

---

## Task 5: Webhook-driven approval resolution

**Files:**

- Create: `lib/hubspot/approval/resolve.ts`
- Create: `lib/hubspot/approval/resolve.test.ts`
- Modify: `lib/hubspot/webhooks/process.ts`
- Modify: `lib/hubspot/webhooks/process.test.ts`

- [ ] **Step 5.1: Write resolver tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveApprovalFromWebhook } from './resolve';

const approvalRepo = {
  findByHubspotDealId: vi.fn(),
  resolve: vi.fn(),
};
const quoteRepo = {
  findLatestByScenario: vi.fn(),
  updatePublishState: vi.fn(),
};
const runPublishScenario = vi.fn();

describe('resolveApprovalFromWebhook', () => {
  beforeEach(() => {
    approvalRepo.findByHubspotDealId.mockReset();
    approvalRepo.resolve.mockReset();
    quoteRepo.findLatestByScenario.mockReset();
    quoteRepo.updatePublishState.mockReset();
    runPublishScenario.mockReset();
  });

  it('approved → resolves request + calls runPublishScenario to resume publish', async () => {
    approvalRepo.findByHubspotDealId.mockResolvedValue({
      id: 'req-1',
      scenarioId: 's1',
      status: 'PENDING',
    });
    approvalRepo.resolve.mockResolvedValue({ id: 'req-1', status: 'APPROVED' });
    runPublishScenario.mockResolvedValue({ status: 'published', hubspotQuoteId: 'hs-q-1' });

    await resolveApprovalFromWebhook({
      hubspotDealId: 'd1',
      newStatus: 'approved',
      hubspotOwnerId: 'owner-42',
      deps: { approvalRepo, quoteRepo, runPublishScenario } as any,
    });

    expect(approvalRepo.resolve).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({ status: 'APPROVED' }),
    );
    expect(runPublishScenario).toHaveBeenCalledWith({
      scenarioId: 's1',
      correlationId: expect.any(String),
    });
  });

  it('rejected → resolves request + updates quote row to APPROVAL_REJECTED, does NOT call publish', async () => {
    approvalRepo.findByHubspotDealId.mockResolvedValue({
      id: 'req-1',
      scenarioId: 's1',
      status: 'PENDING',
    });
    quoteRepo.findLatestByScenario.mockResolvedValue({ id: 'q-row-1' });

    await resolveApprovalFromWebhook({
      hubspotDealId: 'd1',
      newStatus: 'rejected',
      hubspotOwnerId: 'owner-42',
      deps: { approvalRepo, quoteRepo, runPublishScenario } as any,
    });

    expect(approvalRepo.resolve).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({ status: 'REJECTED' }),
    );
    expect(quoteRepo.updatePublishState).toHaveBeenCalledWith('q-row-1', 'APPROVAL_REJECTED');
    expect(runPublishScenario).not.toHaveBeenCalled();
  });

  it('no approval request for deal → no-op (idempotent)', async () => {
    approvalRepo.findByHubspotDealId.mockResolvedValue(null);
    await resolveApprovalFromWebhook({
      hubspotDealId: 'd1',
      newStatus: 'approved',
      hubspotOwnerId: null,
      deps: { approvalRepo, quoteRepo, runPublishScenario } as any,
    });
    expect(approvalRepo.resolve).not.toHaveBeenCalled();
    expect(runPublishScenario).not.toHaveBeenCalled();
  });

  it('already-resolved request → no-op (idempotent on retries)', async () => {
    approvalRepo.findByHubspotDealId.mockResolvedValue({
      id: 'req-1',
      scenarioId: 's1',
      status: 'APPROVED',
      resolvedAt: new Date(),
    });
    await resolveApprovalFromWebhook({
      hubspotDealId: 'd1',
      newStatus: 'approved',
      hubspotOwnerId: null,
      deps: { approvalRepo, quoteRepo, runPublishScenario } as any,
    });
    expect(approvalRepo.resolve).not.toHaveBeenCalled();
    expect(runPublishScenario).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5.2: Implement resolver**

```ts
import { randomUUID } from 'node:crypto';
import { HubSpotApprovalStatus, HubSpotPublishState } from '@prisma/client';
import type { HubSpotApprovalRequestRepository } from '@/lib/db/repositories/hubspotApprovalRequest';
import type { HubSpotQuoteRepository } from '@/lib/db/repositories/hubspotQuote';

export interface ResolveDeps {
  approvalRepo: Pick<HubSpotApprovalRequestRepository, 'findByHubspotDealId' | 'resolve'>;
  quoteRepo: Pick<HubSpotQuoteRepository, 'findLatestByScenario' | 'updatePublishState'>;
  runPublishScenario: (input: { scenarioId: string; correlationId: string }) => Promise<unknown>;
}

export async function resolveApprovalFromWebhook(input: {
  hubspotDealId: string;
  newStatus: string;
  hubspotOwnerId: string | null;
  deps: ResolveDeps;
}): Promise<void> {
  const existing = await input.deps.approvalRepo.findByHubspotDealId(input.hubspotDealId);
  if (!existing) return;
  if (existing.status !== HubSpotApprovalStatus.PENDING) return; // idempotent

  const status = input.newStatus.toLowerCase();
  if (status === 'approved') {
    await input.deps.approvalRepo.resolve(existing.id, {
      status: HubSpotApprovalStatus.APPROVED,
      resolvedByHubspotOwnerId: input.hubspotOwnerId ?? undefined,
    });
    await input.deps.runPublishScenario({
      scenarioId: existing.scenarioId,
      correlationId: `approval-resume-${randomUUID()}`,
    });
  } else if (status === 'rejected') {
    await input.deps.approvalRepo.resolve(existing.id, {
      status: HubSpotApprovalStatus.REJECTED,
      resolvedByHubspotOwnerId: input.hubspotOwnerId ?? undefined,
    });
    const quote = await input.deps.quoteRepo.findLatestByScenario(existing.scenarioId);
    if (quote) {
      await input.deps.quoteRepo.updatePublishState(
        quote.id,
        HubSpotPublishState.APPROVAL_REJECTED,
      );
    }
  }
  // other status values (pending, not_required) → no-op
}
```

- [ ] **Step 5.3: Hook resolver into `webhooks/process.ts`**

Find the `deal.propertyChange` branch. Add a case for `pricer_approval_status` alongside the existing `dealstage` handling:

```ts
if (event.subscriptionType.startsWith('deal.')) {
  const propertyName = String(payload.propertyName ?? '');

  if (propertyName === 'dealstage') {
    // existing Won/Lost handling...
  } else if (propertyName === 'pricer_approval_status') {
    const newStatus = String(payload.propertyValue ?? '');
    const hubspotOwnerId =
      typeof payload.changeSource === 'object' && payload.changeSource
        ? String((payload.changeSource as { sourceUserId?: unknown }).sourceUserId ?? '') || null
        : null;
    const { HubSpotApprovalRequestRepository } =
      await import('@/lib/db/repositories/hubspotApprovalRequest');
    const { resolveApprovalFromWebhook } = await import('../approval/resolve');
    const { runPublishScenario } = await import('../quote/publishService');
    await resolveApprovalFromWebhook({
      hubspotDealId: event.objectId,
      newStatus,
      hubspotOwnerId,
      deps: {
        approvalRepo: new HubSpotApprovalRequestRepository(deps.prisma!),
        quoteRepo: deps.quoteRepo,
        runPublishScenario: (i) => runPublishScenario(i) as Promise<unknown>,
      },
    });
  }
}
```

Requires `ProcessDeps` to expose `prisma` (for constructing the approval repo). Refactor `ProcessDeps` accordingly; adjust callers (route.ts, tests).

- [ ] **Step 5.4: Extend `process.test.ts`**

Add tests for the new branch — `deal.propertyChange pricer_approval_status = approved` → calls `resolveApprovalFromWebhook` with correct args; same for `rejected`.

- [ ] **Step 5.5: Run + commit**

```bash
npm test -- lib/hubspot/approval/resolve.test.ts lib/hubspot/webhooks/process.test.ts
git add lib/hubspot/approval/ lib/hubspot/webhooks/process.ts lib/hubspot/webhooks/process.test.ts
git commit -m "feat(hubspot): webhook-driven approval resolution (approved resumes publish, rejected marks scenario)"
```

---

## Task 6: Webhook route dependency update

**Files:**

- Modify: `app/api/hubspot/webhooks/deal/route.ts`
- Modify: `app/api/hubspot/webhooks/deal/route.test.ts`

- [ ] **Step 6.1: Pass prisma into `ProcessDeps`**

Since Task 5 added `prisma` to `ProcessDeps`, update the deal webhook route's `setImmediate(...)` call to pass it:

```ts
setImmediate(() => {
  processEvent(row.id, { eventRepo, quoteRepo, prisma }).catch(() => {
    // errors are recorded via markFailed inside processEvent
  });
});
```

(Same change needed in the quote webhook route if tests are strict about prisma being present — but the quote webhook only handles quote events, which don't need the approval path. You can pass `undefined` for prisma on the quote route or make `prisma` optional in `ProcessDeps`. Prefer making it optional and guarding inside `process.ts`.)

- [ ] **Step 6.2: Update tests + commit**

Adjust the deal route tests to supply or mock the new dep. Run `npm test -- app/api/hubspot/webhooks/`.

```bash
git add app/api/hubspot/webhooks
git commit -m "feat(hubspot): pass prisma through webhook route → processEvent for approval resolution"
```

---

## Task 7: Admin UI — approval requests page + scenario section updates

**Files:**

- Create: `app/admin/hubspot/approval-requests/page.tsx`
- Modify: `app/scenarios/[id]/hubspot/page.tsx`
- Modify: `app/scenarios/[id]/hubspot/HubSpotSection.tsx`

- [ ] **Step 7.1: Admin approval-requests page**

Server component at `/admin/hubspot/approval-requests`. Loads `HubSpotApprovalRequestRepository.listRecent(200)`, renders a table: scenario name (via `scenario` include), submittedAt, status, resolvedAt, resolvedByHubspotOwnerId, hubspotDealId (linked to HubSpot). Filter options: `pending` / `all`.

Gate with `requireAdmin()`. `export const dynamic = 'force-dynamic'`.

- [ ] **Step 7.2: Scenario page: PENDING_APPROVAL + APPROVAL_REJECTED rendering**

In `HubSpotSection.tsx`, extend the state machine:

- **`publishState === PENDING_APPROVAL`** → banner "Waiting on manager approval" + approval-request submittedAt + link to the Deal in HubSpot + a "Cancel approval request" button (optional, small server action that sets `pricer_approval_status = not_required` via HubSpot API and marks the request resolved as REJECTED by system).
- **`publishState === APPROVAL_REJECTED`** → banner "Manager rejected this scenario" + "Revise and resubmit" button (clears the rejection by bumping revision + publishing; revision bump creates a fresh approval request if overrides still exist).

Load the approval request in `page.tsx` alongside the latest quote row:

```ts
const approvalRequest = await new HubSpotApprovalRequestRepository(prisma).findByScenarioId(
  scenario.id,
);
```

Pass as a prop.

- [ ] **Step 7.3: Commit**

```bash
git add app/admin/hubspot/approval-requests app/scenarios/[id]/hubspot
git commit -m "feat(hubspot): admin approval-requests page + scenario section pending/rejected states"
```

---

## Task 8: HubSpot Developer Project — add owners scope + approval webhook subscription

**Files:**

- Modify: `hubspot-project/src/app/app-hsmeta.json`
- Modify: `hubspot-project/src/app/webhooks/webhooks-hsmeta.json`

- [ ] **Step 8.1: Add `crm.objects.owners.read` scope**

In `app-hsmeta.json` `auth.requiredScopes` array, add:

```
"crm.objects.owners.read"
```

- [ ] **Step 8.2: Add approval-status webhook subscription**

In `webhooks-hsmeta.json`, add a third subscription to the `subscriptions` array:

```json
{
  "subscriptionType": "object.propertyChange",
  "objectType": "deal",
  "propertyName": "pricer_approval_status",
  "active": true
}
```

- [ ] **Step 8.3: Validate**

```bash
cd hubspot-project
hs project validate
```

Expected: `SUCCESS Project ninja-pricer is valid and ready to upload`.

- [ ] **Step 8.4: Commit**

```bash
git add hubspot-project/src/app/app-hsmeta.json hubspot-project/src/app/webhooks/webhooks-hsmeta.json
git commit -m "feat(hubspot): add owners.read scope + approval-status webhook subscription"
```

---

## Task 9: HubSpot Workflow configuration runbook

**Files:**

- Create: `docs/superpowers/runbooks/hubspot-phase-2c-workflow.md`
- Modify: `docs/superpowers/runbooks/hubspot-phase-2b.md`

- [ ] **Step 9.1: Write the workflow runbook**

Create `docs/superpowers/runbooks/hubspot-phase-2c-workflow.md`:

```md
# HubSpot Approval Workflow — Admin Setup

This runbook is for whoever admins the HubSpot portal. The pricer writes `pricer_approval_status = pending` on a Deal to request manager approval. HubSpot must route that to a manager via a Workflow, capture the decision, and write the result back on the same Deal property.

## Contract (what the pricer expects)

1. Workflow triggers when **Deal → `pricer_approval_status` changes to `pending`**.
2. Workflow routes an approval task to the Deal owner's manager (or a designated approver group — portal's call).
3. Manager approves or rejects in HubSpot's task UI.
4. Workflow writes **`pricer_approval_status = approved`** (or `rejected`) back to the Deal.
5. Workflow must NOT mutate other `pricer_*` Deal properties.

The pricer's webhook on `pricer_approval_status` sees the updated value and resumes publish (or marks the scenario rejected).

## Setup steps

### 1. Create the Workflow

HubSpot UI → **Automation → Workflows → Create workflow → From scratch**.

- **Name:** Pricer Approval — Routing
- **Type:** Deal-based

### 2. Trigger

- Object: Deal
- Filter: `pricer_approval_status` has any value of `pending`
- Re-enrollment: yes

### 3. Manager lookup

One of:

- **Per-Deal-owner routing:** in the workflow, fetch the Deal owner's manager via the owner hierarchy. HubSpot supports this natively via "User's manager" attribution.
- **Approver group:** assign to a static list of approver User IDs.

(Portal's call — this runbook doesn't prescribe which. The rest of the workflow is the same either way.)

### 4. Approval step

- **If-then branch:** use HubSpot's **Approval step** (requires an Operations Hub Professional or Enterprise tier; if not available, use a manual "Create task → assign to manager" step and rely on the manager to set the property directly).
- On approval decision:
  - **Approved:** set Deal `pricer_approval_status = approved`.
  - **Rejected:** set Deal `pricer_approval_status = rejected`.

### 5. Task template

Use any of the pricer-stamped properties for context:

- `{{ deal.pricer_scenario_id }}` — links manager back to the pricer scenario (build a link to `https://ninjapricer-production.up.railway.app/scenarios/{id}` in the task description)
- `{{ deal.pricer_margin_pct }}` — margin for context

### 6. Activate

Publish the workflow. Test with a fake Deal (set `pricer_approval_status = pending` manually in HubSpot; confirm the task routes correctly; approve it; confirm the property flips to `approved`).

### 7. Smoke test end-to-end from the pricer

- Build a scenario in the pricer that triggers a hard rail, record an override.
- Link it to a test HubSpot Deal.
- Click **Publish to HubSpot** in the scenario page.
- Expected:
  - Pricer shows "Waiting on manager approval."
  - Deal `pricer_approval_status` is `pending`.
  - Workflow fires; approval task appears for the manager.
  - Manager approves.
  - Within ~5 seconds: pricer's `/admin/hubspot/webhook-events` shows a `pricer_approval_status` event processed.
  - Scenario's HubSpot section transitions to "Published" with the HubSpot Quote URL.

## Troubleshooting

- **Webhook arrives but publish doesn't resume:** check `/admin/hubspot/webhook-events` for the processing error. Most likely: the approval request wasn't found for the Deal (check the Deal has `pricer_scenario_id` stamped and matches a real scenario).
- **Rejected scenarios:** rep sees the rejected state. To re-try after revising: click **Revise and resubmit** on the scenario page.
```

- [ ] **Step 9.2: Reference from phase-2b runbook**

Append to `docs/superpowers/runbooks/hubspot-phase-2b.md`:

```md
## Approval flow (Phase 2c)

Phase 2c adds hard-rail-override approval routing. Setup requires configuring a HubSpot Workflow — see [hubspot-phase-2c-workflow.md](./hubspot-phase-2c-workflow.md).
```

- [ ] **Step 9.3: Commit**

```bash
git add docs/superpowers/runbooks
git commit -m "docs(hubspot): Phase 2c HubSpot Workflow configuration runbook"
```

---

## Task 10: Final verification

- [ ] **Step 10.1: Run verification gates**

```bash
npm test
npm run test:integration
npm run lint
npm run format:check
npm run build
```

All must pass. Fix any minor format/lint issues inline.

- [ ] **Step 10.2: Spec coverage walkthrough**

Re-read the Phase 2 spec's "Approval Flow" section. Confirm each bullet has a corresponding commit. Specifically:

- HubSpotApprovalRequest model ✓ (T1)
- Deal PATCH at threshold breach ✓ (T3)
- `pricer_approval_status = pending` written ✓ (T3)
- HubSpot Workflow contract documented ✓ (T9)
- Webhook handler for `pricer_approval_status` ✓ (T5–T6)
- Approved → resume publish ✓ (T5)
- Rejected → APPROVAL_REJECTED state ✓ (T5)
- Unified admin-override path (admin overrides route through this same flow) ✓ — the approval request is the override gate.

- [ ] **Step 10.3: Commit cleanup if needed**

```bash
git add -A
git commit -m "chore(hubspot): phase 2c lint + format" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** All Approval Flow bullets covered. The "admin-override unification" point from the spec ("When a rep records a hard-override intent on a scenario they're about to publish, the HubSpot approval _is_ the override gate") is implicit — the admin doesn't need a separate in-pricer "release override" action because the approval record serves that role.
- **Placeholder `hubspotQuoteId` during PENDING_APPROVAL:** T4 uses a synthetic `pending-<scenarioId>-<revision>` string to satisfy the `@unique` constraint on HubSpotQuote.hubspotQuoteId until the real publish creates the HubSpot Quote. Documented in code comment. Alternative (making `hubspotQuoteId` nullable) is a schema migration that feels over-engineered for one ephemeral state.
- **Webhook deps refactor (T5/T6):** `ProcessDeps` gains a `prisma?: PrismaClient` field so the approval-resolution branch can construct the approval repo. The quote webhook path doesn't need it; making it optional keeps the existing tests green.
- **No changes to MCP tools for approval status:** `check_publish_status` already returns whatever state is on the `HubSpotQuote` row — after Phase 2c it'll naturally show `PENDING_APPROVAL` / `APPROVAL_REJECTED`. No new MCP tool needed.
- **Known followups:**
  - Extract a reusable "run publish with approval awareness" path and DRY the MCP tool handler further once the approval branch settles in real use.
  - Consider adding `pricer_approval_notes` or a rejection-reason custom property on Deal if managers end up wanting to communicate context.
  - Replace `setImmediate` with a durable worker (carried over from Phase 2b followups).
