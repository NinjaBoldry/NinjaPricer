# Ninja Pricer v1 — Phase 3: Sales UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sales users can create and build scenarios end-to-end — configure seat counts and persona mix on the Notes tab, add labor line items on the Training/White-glove and Service tabs, apply bundle templates, and see live margin feedback in the sticky summary rail — all within a role-aware, permission-respecting builder UI.

**Architecture:** Phase 3 builds on top of the Phase 2 repository and service layer. New scenario-specific repositories (`ScenarioRepository`, `ScenarioSaaSConfigRepository`, `ScenarioLaborLineRepository`) and a `ScenarioService` are added following the existing `lib/db/repositories/` and `lib/services/` patterns. A new `POST /api/compute` endpoint assembles the full rate snapshot from DB and delegates to `lib/engine/compute.ts`. The builder UI is a Next.js app-router layout at `/scenarios/[id]` with tab sub-pages; mutations go through server actions; live recalc uses a debounced client-side fetch to `/api/compute`. The sticky margin rail is a client component that holds computed state; tab input forms are also client components (persona sliders, labor pickers). The engine and service layer remain unchanged except for the one `UserRepository` quick-win in 3.0.

**Tech Stack:** TypeScript (strict), Next.js 14 app router, Prisma, Postgres, NextAuth v5, Zod, shadcn/ui + Tailwind, Vitest (unit/integration), Playwright (smoke), decimal.js.

**Spec reference:** [docs/superpowers/specs/2026-04-17-ninja-pricer-v1-design.md](./2026-04-17-ninja-pricer-v1-design.md)

**Phase roadmap:** [docs/superpowers/plans/2026-04-17-ninja-pricer-v1-phases.md](../plans/2026-04-17-ninja-pricer-v1-phases.md)

**Phase 2 plan:** [docs/superpowers/specs/2026-04-19-ninja-pricer-v1-phase-2-admin-ui.md](./2026-04-19-ninja-pricer-v1-phase-2-admin-ui.md)

---

## Conventions (inherited from Phases 1–2, restated for agentic workers)

- **TDD.** Write failing test → run → implement → run passing → commit.
- **One task = one commit** unless the task explicitly groups multiple commits.
- **Money in the engine:** all engine computations go through `decimal.js`. Final totals in integer cents. Never use `number` for money inside `lib/engine`.
- **Pure engine:** no Prisma imports, no Next.js imports, no `process.env` — engine receives everything as input. Phase 3 does not modify `lib/engine`.
- **Server Actions for mutations.** Every scenario form write goes through a server action. No client-side fetches for writes.
- **Zod at the service boundary.** Services receive raw form data and validate with Zod before touching the DB.
- **Typed errors.** `lib/utils/errors.ts` types (`ValidationError`, `NotFoundError`, `RailHardBlockError`) are thrown by services and mapped to user-facing messages in server actions.
- **Repository pattern.** Repositories are thin Prisma wrappers. Services orchestrate repos; server actions call services. Pages do not import Prisma directly.
- **Commit-message style:** conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `refactor:`, `docs:`).
- **Role-aware rendering.** Cost columns, loaded rates, commission rule details, and raw rail thresholds are hidden from `SALES` role everywhere. Rail warnings use neutral copy only.

---

## Goals

- Sales user can create a scenario, build it across all three tabs (Notes, Training/White-glove, Service), apply a bundle, see live margin feedback, and hand off to quote generation (Phase 4 stub wired here).
- Admin user sees all scenarios on the list page and can filter by owner, status, and customer name.
- `ScenarioRepository`, `ScenarioService`, `ScenarioSaaSConfigRepository`, and `ScenarioLaborLineRepository` are built, tested, and ready for Phase 4 (Quote generation) to consume.
- `POST /api/compute` is the single integration point between the builder UI and the engine; it owns rate-snapshot assembly so the client never touches raw rate data.
- All phase-level happy paths are covered by a Playwright smoke test.

## Non-Goals

- PDF generation, quote download, quote history — Phase 4.
- Scenario sharing or collaboration between users — v2.
- Admin override of hard-blocked rails — v2.
- MCP server consumption of the compute endpoint — v2.
- Staging environment — v1 ships single production.

---

## Sub-phase Overview

| Sub-phase | Theme                               | Key output                                                                                                                                                      |
| --------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.0       | Intake — quick-wins + scaffolding   | `UserRepository.setRole` P2025 fix; `ScenarioRepository`, `ScenarioService`, `ScenarioSaaSConfigRepository`, `ScenarioLaborLineRepository`; `POST /api/compute` |
| 3.1       | Scenarios list page                 | `/scenarios` with filters + "New scenario" action; role-aware owner scoping                                                                                     |
| 3.2       | Builder shell + Notes tab           | `/scenarios/[id]` layout, header, static sticky rail, Notes tab with seat count + persona mix sliders                                                           |
| 3.3       | Training/White-glove + Service tabs | SKU picker + department picker; cost hidden from sales; mutations via server actions                                                                            |
| 3.4       | Live recalc + bundle apply          | Static rail replaced with live compute; debounced `/api/compute` calls; bundle picker that materialises configs                                                 |
| 3.5       | Polish + smoke test                 | Neutral rail copy audit, Generate Quote stub, archive action wired, Playwright smoke                                                                            |

**Parallel workstream (explicit handoff points below):** Integration test wiring — test Postgres (dockerised or CI-managed), wire CI to run the 67 currently-skipped `it.skip` repository tests against a real Postgres instance. This workstream can start immediately after Phase 3.0 completes (scenario repos exist) and must land before phase-level acceptance is declared.

**Sequencing rationale:**

Phase 3.0 runs first because the `UserRepository.setRole` P2025 fix prevents a silent 500 in the concurrent delete + role-change path, and because the four scenario repositories and compute endpoint are load-bearing for everything above. You cannot build the list page without `ScenarioRepository`, cannot write tab data without `ScenarioSaaSConfigRepository` and `ScenarioLaborLineRepository`, and cannot display live margin without `POST /api/compute`. Building these once, tested and stable, before any UI is erected on top avoids rework.

Phases 3.1 → 3.5 are ordered by dependency: a scenario must exist before the builder opens (3.1), the shell must exist before tabs are added (3.2), tab data must be persistable before live recalc can display it (3.3 → 3.4), and polish + smoke run last because they validate the assembled whole (3.5).

shadcn/ui is already installed from Phase 2.1; no new UI library dependencies are introduced in Phase 3.

---

## Phase 3.0 — Intake: Quick-wins + Scaffolding

**Goal:** Close the one pending `UserRepository` bug, then scaffold all four scenario-domain repositories, `ScenarioService`, and the compute API endpoint. No UI in this sub-phase. TDD throughout.

### Task 3.0-A: Fix `UserRepository.setRole` P2025 error

**Context:** `UserRepository.setRole` uses Prisma's `update()`, which throws `PrismaClientKnownRequestError` with code `P2025` when the target record doesn't exist — for example, when a concurrent delete and role-change race. Currently this bubbles as a 500. Fix: catch P2025 and re-throw as `NotFoundError`.

- [ ] **Step 1: Write failing test**

In `lib/db/repositories/user.test.ts`, add:

```typescript
it('throws NotFoundError when setRole targets a non-existent user', async () => {
  const repo = new UserRepository(prisma);
  await expect(repo.setRole('nonexistent-id', 'SALES')).rejects.toThrow(NotFoundError);
});
```

Run: `DATABASE_URL=<test-db> npx vitest run lib/db/repositories/user.test.ts`
Expected: FAIL (currently throws a Prisma error that surfaces as 500).

- [ ] **Step 2: Fix `lib/db/repositories/user.ts`**

In `setRole`, wrap the `prisma.user.update()` call:

```typescript
import { Prisma } from '@prisma/client';
import { NotFoundError } from '@/lib/utils/errors';

async setRole(id: string, role: 'ADMIN' | 'SALES'): Promise<User> {
  try {
    return await this.db.user.update({ where: { id }, data: { role } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new NotFoundError('User', id);
    }
    throw e;
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run lib/db/repositories/user.test.ts
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add lib/db/repositories/user.ts lib/db/repositories/user.test.ts
git commit -m "fix(user): catch P2025 in setRole and throw NotFoundError"
```

---

### Task 3.0-B: ScenarioRepository

**Schema reference:** `Scenario` — `id`, `name`, `customerName`, `ownerId`, `contractMonths`, `appliedBundleId` (nullable, FK to `Bundle`), `notes` (nullable), `status` (`ScenarioStatus`: `DRAFT` | `QUOTED` | `ARCHIVED`), `isArchived`, `createdAt`, `updatedAt`.

- [ ] **Step 1: Write failing tests**

Create `lib/db/repositories/scenario.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ScenarioRepository } from './scenario';
import { seedTestUser } from '../../tests/fixtures/db';

// Integration test — requires test database.
// Run: DATABASE_URL=<test-db> npx vitest run lib/db/repositories/scenario.test.ts

const prisma = new PrismaClient();
const repo = new ScenarioRepository(prisma);
let testUserId: string;
let otherUserId: string;

beforeEach(async () => {
  await prisma.scenario.deleteMany();
  const u1 = await seedTestUser(prisma, 'owner@test.com');
  const u2 = await seedTestUser(prisma, 'other@test.com');
  testUserId = u1.id;
  otherUserId = u2.id;
});

describe('ScenarioRepository', () => {
  it('creates a DRAFT scenario and finds it by id', async () => {
    const created = await repo.create({
      name: 'Acme Deal',
      customerName: 'Acme Corp',
      ownerId: testUserId,
      contractMonths: 12,
    });
    expect(created.status).toBe('DRAFT');
    expect(created.isArchived).toBe(false);
    const found = await repo.findById(created.id);
    expect(found?.customerName).toBe('Acme Corp');
  });

  it('lists scenarios filtered by ownerId', async () => {
    await repo.create({ name: 'Mine', customerName: 'A', ownerId: testUserId, contractMonths: 12 });
    await repo.create({
      name: 'Theirs',
      customerName: 'B',
      ownerId: otherUserId,
      contractMonths: 6,
    });
    const mine = await repo.list({ ownerId: testUserId });
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe('Mine');
  });

  it('lists all scenarios when no filter provided', async () => {
    await repo.create({ name: 'A', customerName: 'X', ownerId: testUserId, contractMonths: 12 });
    await repo.create({ name: 'B', customerName: 'Y', ownerId: otherUserId, contractMonths: 6 });
    const all = await repo.list({});
    expect(all).toHaveLength(2);
  });

  it('filters by customerName (case-insensitive)', async () => {
    await repo.create({
      name: 'Deal',
      customerName: 'Acme Corp',
      ownerId: testUserId,
      contractMonths: 12,
    });
    const found = await repo.list({ customerName: 'acme' });
    expect(found).toHaveLength(1);
  });

  it('archives a scenario and excludes it from default list', async () => {
    const s = await repo.create({
      name: 'Old',
      customerName: 'X',
      ownerId: testUserId,
      contractMonths: 12,
    });
    await repo.archive(s.id);
    const found = await repo.findById(s.id);
    expect(found?.isArchived).toBe(true);
    expect(found?.status).toBe('ARCHIVED');
    const active = await repo.list({ ownerId: testUserId });
    expect(active).toHaveLength(0);
  });

  it('findById returns null for unknown id', async () => {
    expect(await repo.findById('nonexistent')).toBeNull();
  });
});
```

Run: `npx vitest run lib/db/repositories/scenario.test.ts`
Expected: FAIL.

- [ ] **Step 2: Create `lib/db/repositories/scenario.ts`**

```typescript
import type { PrismaClient, Scenario, ScenarioStatus } from '@prisma/client';
import type { ScenarioSaaSConfig, ScenarioLaborLine } from '@prisma/client';

export interface ScenarioListFilters {
  ownerId?: string;
  status?: ScenarioStatus;
  customerName?: string;
}

export type ScenarioWithRelations = Scenario & {
  saasConfigs: ScenarioSaaSConfig[];
  laborLines: ScenarioLaborLine[];
};

export class ScenarioRepository {
  constructor(private db: PrismaClient) {}

  async create(data: {
    name: string;
    customerName: string;
    ownerId: string;
    contractMonths: number;
    notes?: string;
  }): Promise<Scenario> {
    return this.db.scenario.create({
      data: { ...data, status: 'DRAFT', isArchived: false },
    });
  }

  async findById(id: string): Promise<ScenarioWithRelations | null> {
    return this.db.scenario.findUnique({
      where: { id },
      include: {
        saasConfigs: true,
        laborLines: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async list(filters: ScenarioListFilters = {}): Promise<Scenario[]> {
    return this.db.scenario.findMany({
      where: {
        ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.customerName
          ? { customerName: { contains: filters.customerName, mode: 'insensitive' } }
          : {}),
        isArchived: false,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      customerName: string;
      contractMonths: number;
      notes: string | null;
      appliedBundleId: string | null;
      status: ScenarioStatus;
    }>,
  ): Promise<Scenario> {
    return this.db.scenario.update({ where: { id }, data });
  }

  async archive(id: string): Promise<Scenario> {
    return this.db.scenario.update({
      where: { id },
      data: { isArchived: true, status: 'ARCHIVED' },
    });
  }
}
```

- [ ] **Step 3: Export from barrel**

In `lib/db/repositories/index.ts`: `export { ScenarioRepository } from './scenario';`

- [ ] **Step 4: Run tests and commit**

```bash
npx vitest run lib/db/repositories/scenario.test.ts
git add lib/db/repositories/scenario.ts lib/db/repositories/scenario.test.ts lib/db/repositories/index.ts
git commit -m "feat(scenario): ScenarioRepository with CRUD, list filters, and archive"
```

---

### Task 3.0-C: ScenarioSaaSConfigRepository

**Schema reference:** `ScenarioSaaSConfig` — `id`, `scenarioId`, `productId`, `seatCount` (Int), `personaMix` (Json — `{personaId: string, pct: number}[]`), `discountOverridePct` (Decimal?). Unique on `(scenarioId, productId)` — there is at most one SaaS config per product per scenario.

- [ ] **Step 1: Write failing tests**

Create `lib/db/repositories/scenario-saas-config.test.ts`. Cover:

- `upsert` creates on first call; updates `seatCount` on a second call for the same `(scenarioId, productId)`.
- `findByScenario` returns all configs for a scenario.
- `personaMix` round-trips through JSON correctly (values survive a write + read cycle).

- [ ] **Step 2: Create `lib/db/repositories/scenario-saas-config.ts`**

```typescript
import type { PrismaClient, ScenarioSaaSConfig } from '@prisma/client';
import type { Decimal } from 'decimal.js';

export class ScenarioSaaSConfigRepository {
  constructor(private db: PrismaClient) {}

  async upsert(data: {
    scenarioId: string;
    productId: string;
    seatCount: number;
    personaMix: { personaId: string; pct: number }[];
    discountOverridePct?: Decimal | null;
  }): Promise<ScenarioSaaSConfig> {
    const { scenarioId, productId, personaMix, ...rest } = data;
    const mixJson = personaMix as unknown as object[];
    return this.db.scenarioSaaSConfig.upsert({
      where: { scenarioId_productId: { scenarioId, productId } },
      create: { scenarioId, productId, personaMix: mixJson, ...rest },
      update: { personaMix: mixJson, ...rest },
    });
  }

  async findByScenario(scenarioId: string): Promise<ScenarioSaaSConfig[]> {
    return this.db.scenarioSaaSConfig.findMany({ where: { scenarioId } });
  }

  async delete(scenarioId: string, productId: string): Promise<void> {
    await this.db.scenarioSaaSConfig.delete({
      where: { scenarioId_productId: { scenarioId, productId } },
    });
  }
}
```

- [ ] **Step 3: Export, run tests, commit**

```bash
git add lib/db/repositories/scenario-saas-config.ts lib/db/repositories/scenario-saas-config.test.ts lib/db/repositories/index.ts
git commit -m "feat(scenario): ScenarioSaaSConfigRepository with upsert"
```

---

### Task 3.0-D: ScenarioLaborLineRepository

**Schema reference:** `ScenarioLaborLine` — `id`, `scenarioId`, `productId`, `skuId` (nullable, FK to `LaborSKU`), `departmentId` (nullable, FK to `Department`), `customDescription` (nullable), `qty` (Decimal), `unit` (String), `costPerUnitUsd` (Decimal), `revenuePerUnitUsd` (Decimal), `sortOrder` (Int).

- [ ] **Step 1: Write failing tests**

Create `lib/db/repositories/scenario-labor-line.test.ts`. Cover:

- `create` returns the new row with the correct `sortOrder`.
- `findByScenario` returns rows ordered by `sortOrder` ascending.
- `update` changes `qty` without affecting other fields.
- `delete` removes the row; subsequent `findByScenario` returns one fewer row.

- [ ] **Step 2: Create `lib/db/repositories/scenario-labor-line.ts`**

```typescript
import type { PrismaClient, ScenarioLaborLine } from '@prisma/client';
import type { Decimal } from 'decimal.js';

export class ScenarioLaborLineRepository {
  constructor(private db: PrismaClient) {}

  async create(data: {
    scenarioId: string;
    productId: string;
    skuId?: string | null;
    departmentId?: string | null;
    customDescription?: string | null;
    qty: Decimal;
    unit: string;
    costPerUnitUsd: Decimal;
    revenuePerUnitUsd: Decimal;
    sortOrder?: number;
  }): Promise<ScenarioLaborLine> {
    return this.db.scenarioLaborLine.create({ data });
  }

  async findByScenario(scenarioId: string): Promise<ScenarioLaborLine[]> {
    return this.db.scenarioLaborLine.findMany({
      where: { scenarioId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async update(
    id: string,
    data: Partial<{
      qty: Decimal;
      costPerUnitUsd: Decimal;
      revenuePerUnitUsd: Decimal;
      customDescription: string | null;
      sortOrder: number;
    }>,
  ): Promise<ScenarioLaborLine> {
    return this.db.scenarioLaborLine.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.db.scenarioLaborLine.delete({ where: { id } });
  }

  async deleteByScenario(scenarioId: string): Promise<void> {
    await this.db.scenarioLaborLine.deleteMany({ where: { scenarioId } });
  }
}
```

- [ ] **Step 3: Export, run tests, commit**

```bash
git add lib/db/repositories/scenario-labor-line.ts lib/db/repositories/scenario-labor-line.test.ts lib/db/repositories/index.ts
git commit -m "feat(scenario): ScenarioLaborLineRepository"
```

---

### Task 3.0-E: ScenarioService

Orchestrates `ScenarioRepository`, `ScenarioSaaSConfigRepository`, and `ScenarioLaborLineRepository`. Validates with Zod before any repo call. Services receive typed arguments from server actions; they never receive raw `FormData`.

- [ ] **Step 1: Write failing tests (unit tests with mocked repos)**

Create `lib/services/scenario.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ScenarioService } from './scenario';
import { ValidationError } from '../utils/errors';

function mockScenarioRepo() {
  return {
    create: vi.fn().mockResolvedValue({
      id: 's1',
      name: 'Test',
      customerName: 'Corp',
      ownerId: 'u1',
      contractMonths: 12,
      status: 'DRAFT',
      isArchived: false,
      appliedBundleId: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    findById: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
    archive: vi.fn().mockResolvedValue({}),
  };
}

describe('ScenarioService.createScenario', () => {
  it('throws ValidationError when customerName is empty', async () => {
    const service = new ScenarioService(mockScenarioRepo() as any, {} as any, {} as any);
    await expect(
      service.createScenario({ name: 'Deal', customerName: '', contractMonths: 12, ownerId: 'u1' }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when contractMonths is 0', async () => {
    const service = new ScenarioService(mockScenarioRepo() as any, {} as any, {} as any);
    await expect(
      service.createScenario({
        name: 'Deal',
        customerName: 'Corp',
        contractMonths: 0,
        ownerId: 'u1',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('creates a scenario when data is valid', async () => {
    const repo = mockScenarioRepo();
    const service = new ScenarioService(repo as any, {} as any, {} as any);
    const result = await service.createScenario({
      name: 'Big Deal',
      customerName: 'Acme',
      contractMonths: 12,
      ownerId: 'u1',
    });
    expect(result.name).toBe('Test');
    expect(repo.create).toHaveBeenCalledOnce();
  });
});

describe('ScenarioService.upsertSaaSConfig', () => {
  it('throws ValidationError when personaMix does not sum to 100', async () => {
    const service = new ScenarioService({} as any, { upsert: vi.fn() } as any, {} as any);
    await expect(
      service.upsertSaaSConfig({
        scenarioId: 's1',
        productId: 'p1',
        seatCount: 10,
        personaMix: [
          { personaId: 'pa1', pct: 60 },
          { personaId: 'pa2', pct: 30 },
        ],
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('ScenarioService.listScenarios', () => {
  it('restricts SALES role to their own ownerId regardless of filter', async () => {
    const repo = mockScenarioRepo();
    const service = new ScenarioService(repo as any, {} as any, {} as any);
    await service.listScenarios({
      requestingUserId: 'u1',
      requestingUserRole: 'SALES',
      ownerId: 'other-user', // should be ignored for SALES
    });
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'u1' }));
  });

  it('passes admin-supplied ownerId filter through', async () => {
    const repo = mockScenarioRepo();
    const service = new ScenarioService(repo as any, {} as any, {} as any);
    await service.listScenarios({
      requestingUserId: 'admin1',
      requestingUserRole: 'ADMIN',
      ownerId: 'u2',
    });
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'u2' }));
  });
});
```

Run: `npx vitest run lib/services/scenario.test.ts`
Expected: FAIL.

- [ ] **Step 2: Create `lib/services/scenario.ts`**

```typescript
import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError, NotFoundError } from '../utils/errors';
import type { ScenarioRepository, ScenarioListFilters } from '../db/repositories/scenario';
import type { ScenarioSaaSConfigRepository } from '../db/repositories/scenario-saas-config';
import type { ScenarioLaborLineRepository } from '../db/repositories/scenario-labor-line';

const CreateScenarioSchema = z.object({
  name: z.string().min(1, 'Scenario name is required'),
  customerName: z.string().min(1, 'Customer name is required'),
  contractMonths: z.number().int().min(1, 'Contract must be at least 1 month'),
  ownerId: z.string().min(1),
  notes: z.string().optional(),
});

const PersonaMixEntrySchema = z.object({
  personaId: z.string().min(1),
  pct: z.number().int().min(0).max(100),
});

const UpsertSaaSConfigSchema = z.object({
  scenarioId: z.string().min(1),
  productId: z.string().min(1),
  seatCount: z.number().int().min(0),
  personaMix: z.array(PersonaMixEntrySchema).min(1),
  discountOverridePct: z.number().min(0).max(100).nullable().optional(),
});

export class ScenarioService {
  constructor(
    private scenarioRepo: ScenarioRepository,
    private saasConfigRepo: ScenarioSaaSConfigRepository,
    private laborLineRepo: ScenarioLaborLineRepository,
  ) {}

  async createScenario(data: unknown) {
    const parsed = CreateScenarioSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
    return this.scenarioRepo.create(parsed.data);
  }

  async upsertSaaSConfig(data: unknown) {
    const parsed = UpsertSaaSConfigSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
    const mixTotal = parsed.data.personaMix.reduce((s, p) => s + p.pct, 0);
    if (mixTotal !== 100) throw new ValidationError('Persona mix must sum to 100%');
    return this.saasConfigRepo.upsert({
      ...parsed.data,
      discountOverridePct:
        parsed.data.discountOverridePct != null
          ? new Decimal(parsed.data.discountOverridePct)
          : null,
    });
  }

  async listScenarios(options: {
    requestingUserId: string;
    requestingUserRole: 'ADMIN' | 'SALES';
    ownerId?: string;
    customerName?: string;
  }): Promise<Awaited<ReturnType<ScenarioRepository['list']>>> {
    const filter: ScenarioListFilters =
      options.requestingUserRole === 'ADMIN'
        ? { ownerId: options.ownerId, customerName: options.customerName }
        : { ownerId: options.requestingUserId };
    return this.scenarioRepo.list(filter);
  }

  async archiveScenario(
    id: string,
    requestingUserId: string,
    requestingUserRole: 'ADMIN' | 'SALES',
  ) {
    const scenario = await this.scenarioRepo.findById(id);
    if (!scenario) throw new NotFoundError('Scenario', id);
    if (requestingUserRole !== 'ADMIN' && scenario.ownerId !== requestingUserId) {
      throw new ValidationError('You do not have permission to archive this scenario');
    }
    return this.scenarioRepo.archive(id);
  }
}
```

- [ ] **Step 3: Export, run tests, commit**

```bash
git add lib/services/scenario.ts lib/services/scenario.test.ts lib/services/index.ts
git commit -m "feat(scenario): ScenarioService with Zod validation and role-scoped list"
```

---

### Task 3.0-F: Compute API endpoint

**Goal:** `POST /api/compute` accepts the scenario's current inputs (not a saved scenarioId — the endpoint is used for unsaved live state), assembles the full rate snapshot from DB, calls `compute()`, and returns `ComputeResult` as JSON.

**Why a route handler (not a server action):** Live recalc is a client-side debounced `fetch()`; Next.js server actions cannot be called from `fetch()`. The endpoint is authenticated via the session.

**Two-module design:**

1. `lib/services/compute-snapshot.ts` — `fetchRateSnapshot(db, productIds)` fetches all rate data for the given product IDs; `buildComputeRequest(inputs, snapshot)` is a pure function that assembles a `ComputeRequest` from the fetched data and the scenario inputs. Keeping fetch and transform separate makes `buildComputeRequest` unit-testable without a DB.
2. `app/api/compute/route.ts` — authenticates, validates body, calls `fetchRateSnapshot`, calls `buildComputeRequest`, calls `compute()`, returns JSON.

- [ ] **Step 1: Write unit test for `buildComputeRequest`**

Create `lib/services/compute-snapshot.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { buildComputeRequest } from './compute-snapshot';
import type { SaaSProductSnap } from '../engine/types';

const MOCK_SAAS_SNAP: SaaSProductSnap = {
  kind: 'SAAS_USAGE',
  productId: 'p1',
  vendorRates: [],
  baseUsage: [],
  otherVariableUsdPerUserPerMonth: new Decimal('0'),
  personas: [{ id: 'pa1', name: 'Average', multiplier: new Decimal('1') }],
  fixedCosts: [],
  activeUsersAtScale: 100,
  listPriceUsdPerSeatPerMonth: new Decimal('50'),
  volumeTiers: [],
  contractModifiers: [],
};

describe('buildComputeRequest', () => {
  it('assembles a ComputeRequest with one SaaS tab', () => {
    const result = buildComputeRequest({
      contractMonths: 12,
      saasInputs: [
        { productId: 'p1', seatCount: 10, personaMix: [{ personaId: 'pa1', pct: 100 }] },
      ],
      laborInputs: [],
      saasProducts: { p1: MOCK_SAAS_SNAP },
      commissionRules: [],
      rails: [],
      departments: {},
      laborSKUs: {},
    });
    expect(result.contractMonths).toBe(12);
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].kind).toBe('SAAS_USAGE');
    const tab = result.tabs[0] as { seatCount: number };
    expect(tab.seatCount).toBe(10);
  });

  it('throws ValidationError when saasInput references unknown productId', () => {
    expect(() =>
      buildComputeRequest({
        contractMonths: 12,
        saasInputs: [
          { productId: 'ghost', seatCount: 5, personaMix: [{ personaId: 'pa1', pct: 100 }] },
        ],
        laborInputs: [],
        saasProducts: {},
        commissionRules: [],
        rails: [],
        departments: {},
        laborSKUs: {},
      }),
    ).toThrow();
  });
});
```

Run: `npx vitest run lib/services/compute-snapshot.test.ts`
Expected: FAIL.

- [ ] **Step 2: Create `lib/services/compute-snapshot.ts`**

```typescript
import type { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';
import type {
  ComputeRequest,
  SaaSProductSnap,
  LaborSKUSnap,
  DepartmentSnap,
  CommissionRuleSnap,
  RailSnap,
} from '../engine/types';

export interface RateSnapshot {
  saasProducts: Record<string, SaaSProductSnap>;
  laborSKUs: Record<string, LaborSKUSnap>;
  departments: Record<string, DepartmentSnap>;
  commissionRules: CommissionRuleSnap[];
  rails: RailSnap[];
}

export async function fetchRateSnapshot(
  db: PrismaClient,
  productIds: string[],
): Promise<RateSnapshot> {
  // Fetch products with all related rate data
  const products = await db.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    include: {
      vendorRates: true,
      baseUsage: true,
      otherVariable: true,
      personas: { orderBy: { sortOrder: 'asc' } },
      fixedCosts: true,
      scale: true,
      listPrice: true,
      volumeTiers: { orderBy: { minSeats: 'asc' } },
      contractModifiers: { orderBy: { minMonths: 'asc' } },
      laborSKUs: { where: { isActive: true } },
      rails: { where: { isEnabled: true } },
    },
  });

  const saasProducts: Record<string, SaaSProductSnap> = {};
  const laborSKUs: Record<string, LaborSKUSnap> = {};
  const rails: RailSnap[] = [];

  for (const p of products) {
    if (p.kind === 'SAAS_USAGE') {
      saasProducts[p.id] = {
        kind: 'SAAS_USAGE',
        productId: p.id,
        vendorRates: p.vendorRates.map((vr) => ({
          id: vr.id,
          name: vr.name,
          unitLabel: vr.unitLabel,
          rateUsd: new Decimal(vr.rateUsd.toString()),
        })),
        baseUsage: p.baseUsage.map((bu) => ({
          vendorRateId: bu.vendorRateId,
          usagePerMonth: new Decimal(bu.usagePerMonth.toString()),
        })),
        otherVariableUsdPerUserPerMonth: new Decimal(
          p.otherVariable?.usdPerUserPerMonth.toString() ?? '0',
        ),
        personas: p.personas.map((pe) => ({
          id: pe.id,
          name: pe.name,
          multiplier: new Decimal(pe.multiplier.toString()),
        })),
        fixedCosts: p.fixedCosts.map((fc) => ({
          id: fc.id,
          name: fc.name,
          monthlyUsd: new Decimal(fc.monthlyUsd.toString()),
        })),
        activeUsersAtScale: p.scale?.activeUsersAtScale ?? 1,
        listPriceUsdPerSeatPerMonth: new Decimal(p.listPrice?.usdPerSeatPerMonth.toString() ?? '0'),
        volumeTiers: p.volumeTiers.map((t) => ({
          minSeats: t.minSeats,
          discountPct: new Decimal(t.discountPct.toString()),
        })),
        contractModifiers: p.contractModifiers.map((t) => ({
          minMonths: t.minMonths,
          additionalDiscountPct: new Decimal(t.additionalDiscountPct.toString()),
        })),
      };
    }
    for (const sku of p.laborSKUs) {
      laborSKUs[sku.id] = {
        id: sku.id,
        productId: sku.productId,
        name: sku.name,
        unit: sku.unit,
        costPerUnitUsd: new Decimal(sku.costPerUnitUsd.toString()),
        defaultRevenuePerUnitUsd: new Decimal(sku.defaultRevenueUsd.toString()),
      };
    }
    for (const rail of p.rails) {
      rails.push({
        id: rail.id,
        productId: rail.productId,
        kind: rail.kind,
        marginBasis: rail.marginBasis,
        softThreshold: new Decimal(rail.softThreshold.toString()),
        hardThreshold: new Decimal(rail.hardThreshold.toString()),
      });
    }
  }

  // Departments (for custom labor tabs)
  const deptRows = await db.department.findMany({
    where: { isActive: true },
    include: {
      billRate: true,
      employees: { where: { isActive: true } },
      burdens: { where: { isActive: true } },
    },
  });

  const departments: Record<string, DepartmentSnap> = {};
  for (const d of deptRows) {
    // Loaded rate is computed in lib/services/labor.ts computeLoadedHourlyRate —
    // aggregate across employees here for the snapshot.
    const loadedRatePerHour = computeDeptLoadedRate(d);
    departments[d.id] = {
      id: d.id,
      name: d.name,
      loadedRatePerHourUsd: loadedRatePerHour,
      billRatePerHourUsd: new Decimal(d.billRate?.billRatePerHour.toString() ?? '0'),
    };
  }

  // Commission rules (all active, with tiers)
  const ruleRows = await db.commissionRule.findMany({
    where: { isActive: true },
    include: { tiers: { orderBy: { thresholdFromUsd: 'asc' } } },
  });

  const commissionRules: CommissionRuleSnap[] = ruleRows
    .filter((r) => r.tiers.length > 0)
    .map((r) => ({
      id: r.id,
      name: r.name,
      scopeType: r.scopeType,
      scopeProductId: r.scopeProductId ?? undefined,
      scopeDepartmentId: r.scopeDepartmentId ?? undefined,
      baseMetric: r.baseMetric,
      tiers: r.tiers.map((t) => ({
        thresholdFromUsd: new Decimal(t.thresholdFromUsd.toString()),
        ratePct: new Decimal(t.ratePct.toString()),
      })),
      recipientEmployeeId: r.recipientEmployeeId ?? undefined,
    }));

  return { saasProducts, laborSKUs, departments, commissionRules, rails };
}

// Pure transform — receives pre-fetched snapshot data.
export function buildComputeRequest(
  input: {
    contractMonths: number;
    saasInputs: {
      productId: string;
      seatCount: number;
      personaMix: { personaId: string; pct: number }[];
      discountOverridePct?: number | null;
    }[];
    laborInputs: {
      productId: string;
      skuId?: string | null;
      departmentId?: string | null;
      customDescription?: string | null;
      qty: number;
      unit: string;
      costPerUnitUsd: number;
      revenuePerUnitUsd: number;
    }[];
  } & RateSnapshot,
): ComputeRequest {
  const tabs: ComputeRequest['tabs'] = [];

  for (const si of input.saasInputs) {
    const snap = input.saasProducts[si.productId];
    if (!snap) throw new ValidationError(`No rate data found for product ${si.productId}`);
    tabs.push({
      kind: 'SAAS_USAGE',
      productId: si.productId,
      seatCount: si.seatCount,
      personaMix: si.personaMix,
      ...(si.discountOverridePct != null
        ? { discountOverridePct: new Decimal(si.discountOverridePct) }
        : {}),
    });
  }

  for (const li of input.laborInputs) {
    if (li.skuId) {
      tabs.push({
        kind: 'PACKAGED_LABOR',
        productId: li.productId,
        lineItems: [
          {
            skuId: li.skuId,
            customDescription: li.customDescription ?? undefined,
            qty: new Decimal(li.qty),
            unit: li.unit,
            costPerUnitUsd: new Decimal(li.costPerUnitUsd),
            revenuePerUnitUsd: new Decimal(li.revenuePerUnitUsd),
          },
        ],
      });
    } else {
      tabs.push({
        kind: 'CUSTOM_LABOR',
        productId: li.productId,
        lineItems: [
          {
            departmentId: li.departmentId ?? undefined,
            customDescription: li.customDescription ?? undefined,
            hours: new Decimal(li.qty),
          },
        ],
      });
    }
  }

  return {
    contractMonths: input.contractMonths,
    tabs,
    products: {
      saas: input.saasProducts,
      laborSKUs: input.laborSKUs,
      departments: input.departments,
    },
    commissionRules: input.commissionRules,
    rails: input.rails,
  };
}

// Dept loaded rate helper — mirrors lib/services/labor.ts computeLoadedHourlyRate but
// accepts the Prisma-shaped include rather than the service DTO.
function computeDeptLoadedRate(dept: {
  employees: { annualSalaryUsd: any; hourlyRateUsd: any; standardHoursPerYear: number | null }[];
  burdens: { ratePct: any; capUsd: any | null }[];
}): Decimal {
  if (dept.employees.length === 0) return new Decimal(0);
  const rates = dept.employees.map((e) => {
    const hoursPerYear = new Decimal(e.standardHoursPerYear ?? 2080);
    const baseAnnual = e.annualSalaryUsd
      ? new Decimal(e.annualSalaryUsd.toString())
      : new Decimal(e.hourlyRateUsd?.toString() ?? '0').mul(hoursPerYear);
    const burdenTotal = dept.burdens.reduce((acc, b) => {
      const base = b.capUsd
        ? Decimal.min(baseAnnual, new Decimal(b.capUsd.toString()))
        : baseAnnual;
      return acc.plus(base.mul(new Decimal(b.ratePct.toString())).div(100));
    }, new Decimal(0));
    return baseAnnual.plus(burdenTotal).div(hoursPerYear);
  });
  return rates.reduce((s, r) => s.plus(r), new Decimal(0)).div(rates.length);
}
```

- [ ] **Step 3: Create `app/api/compute/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { compute } from '@/lib/engine';
import { fetchRateSnapshot, buildComputeRequest } from '@/lib/services/compute-snapshot';
import { ValidationError } from '@/lib/utils/errors';
import { z } from 'zod';

const ComputeBodySchema = z.object({
  contractMonths: z.number().int().min(1),
  saasConfigs: z.array(
    z.object({
      productId: z.string(),
      seatCount: z.number().int().min(0),
      personaMix: z.array(z.object({ personaId: z.string(), pct: z.number() })),
      discountOverridePct: z.number().nullable().optional(),
    }),
  ),
  laborLines: z.array(
    z.object({
      productId: z.string(),
      skuId: z.string().nullable().optional(),
      departmentId: z.string().nullable().optional(),
      customDescription: z.string().nullable().optional(),
      qty: z.number(),
      unit: z.string(),
      costPerUnitUsd: z.number(),
      revenuePerUnitUsd: z.number(),
    }),
  ),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = ComputeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { data } = parsed;
  const productIds = [
    ...new Set([
      ...data.saasConfigs.map((c) => c.productId),
      ...data.laborLines.map((l) => l.productId),
    ]),
  ];

  try {
    const snapshot = await fetchRateSnapshot(db, productIds);
    const request = buildComputeRequest({
      contractMonths: data.contractMonths,
      saasInputs: data.saasConfigs,
      laborInputs: data.laborLines,
      ...snapshot,
    });
    const result = compute(request);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
```

- [ ] **Step 4: TypeScript check and commit**

```bash
npx tsc --noEmit
git add app/api/compute/route.ts lib/services/compute-snapshot.ts lib/services/compute-snapshot.test.ts
git commit -m "feat(compute): POST /api/compute assembles rate snapshot and calls engine"
```

---

### Phase 3.0 completion check

```bash
npx vitest run
npx tsc --noEmit
npx eslint . --max-warnings 0
```

All three must pass clean before moving to Phase 3.1.

**Parallel workstream handoff point 1:** The integration test wiring session can begin now. All four scenario repository test files exist; the session needs: test Postgres connection string, the `seedTestUser` / `seedTestProduct` fixtures file, and the Vitest integration project config. Coordinate on: truncate-per-`beforeEach` vs. per-file rollback strategy; FK seed order (User before Scenario, Product before ScenarioSaaSConfig); CI environment variable injection (`TEST_DATABASE_URL`).

---

## Phase 3.1 — Scenarios List Page

**Goal:** Sales users land at `/scenarios` and see only their own scenarios; admins see all. "New scenario" creates a DRAFT and redirects into the builder. Filters available: owner (admin only), status, customer name.

### File map

```
app/
  scenarios/
    page.tsx                    (server component — fetches list, renders table)
    new/
      page.tsx                  (name + customerName + contractMonths form)
      actions.ts                (createScenario → redirect to builder)

components/
  scenarios/
    ScenarioFilters.tsx         (client component — URL search param driven filter controls)
```

### Task 3.1-A: Scenarios list page

- [ ] **Step 1: Create `app/scenarios/page.tsx`**

```tsx
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import { ScenarioService } from '@/lib/services/scenario';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default async function ScenariosPage({
  searchParams,
}: {
  searchParams: { ownerId?: string; customer?: string; status?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

  const service = new ScenarioService(new ScenarioRepository(db), null as any, null as any);
  const scenarios = await service.listScenarios({
    requestingUserId: session.user.id,
    requestingUserRole: session.user.role,
    ownerId: searchParams.ownerId,
    customerName: searchParams.customer,
  });

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Scenarios</h1>
        <Button asChild>
          <Link href="/scenarios/new">New scenario</Link>
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Customer</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((s) => (
            <tr key={s.id} className="border-b last:border-0">
              <td className="py-3">
                <Link href={`/scenarios/${s.id}`} className="font-medium hover:underline">
                  {s.name}
                </Link>
              </td>
              <td className="py-3 text-slate-600">{s.customerName}</td>
              <td className="py-3">
                <Badge variant={s.status === 'DRAFT' ? 'secondary' : 'default'}>{s.status}</Badge>
              </td>
              <td className="py-3 text-slate-500 text-xs">
                {new Date(s.updatedAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
          {scenarios.length === 0 && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-slate-400 text-sm">
                No scenarios yet. Create one to get started.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/scenarios/new/page.tsx` and `actions.ts`**

```tsx
// app/scenarios/new/page.tsx
import { createScenarioAction } from './actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function NewScenarioPage() {
  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-semibold mb-6">New scenario</h1>
      <form action={createScenarioAction} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="name">Scenario name</Label>
          <Input id="name" name="name" required placeholder="Q3 Enterprise Pitch" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="customerName">Customer</Label>
          <Input id="customerName" name="customerName" required placeholder="Acme Corp" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="contractMonths">Contract length (months)</Label>
          <Input
            id="contractMonths"
            name="contractMonths"
            type="number"
            min="1"
            defaultValue="12"
            required
          />
        </div>
        <Button type="submit">Create scenario</Button>
      </form>
    </div>
  );
}
```

```typescript
// app/scenarios/new/actions.ts
'use server';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import { ScenarioService } from '@/lib/services/scenario';
import { ValidationError } from '@/lib/utils/errors';

export async function createScenarioAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const service = new ScenarioService(new ScenarioRepository(db), null as any, null as any);
  try {
    const scenario = await service.createScenario({
      name: String(formData.get('name') ?? ''),
      customerName: String(formData.get('customerName') ?? ''),
      contractMonths: Number(formData.get('contractMonths')),
      ownerId: session.user.id,
    });
    redirect(`/scenarios/${scenario.id}/notes`);
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
}
```

- [ ] **Step 3: TypeScript check and commit**

```bash
npx tsc --noEmit
git add app/scenarios/page.tsx app/scenarios/new/
git commit -m "feat(scenarios): list page with role-aware scoping + new scenario form"
```

---

## Phase 3.2 — Builder Shell + Notes Tab

**Goal:** `/scenarios/[id]` renders the builder layout: header (name, customer, contract months, status), a sticky left margin rail (static placeholder values in this sub-phase — live compute arrives in 3.4), and tab navigation. The Notes tab is fully functional: seat count input, persona mix sliders with live 100%-sum enforcement, save via server action.

### File map

```
app/
  scenarios/
    [id]/
      layout.tsx                (server component — fetches scenario, renders shell)
      page.tsx                  (redirect to /scenarios/[id]/notes)
      notes/
        page.tsx                (Notes tab server component — fetches config + personas)
        actions.ts              (upsertSaaSConfigAction)
      training/
        page.tsx                (stub placeholder — Phase 3.3)
      service/
        page.tsx                (stub placeholder — Phase 3.3)

components/
  scenarios/
    ScenarioHeader.tsx          (name, customer, contract length, status, action buttons)
    ScenarioRail.tsx            (client component — static in 3.2; driven by live state in 3.4)
    PersonaMixSliders.tsx       (client component — sliders sum to 100, enforce on change)
    NotesTabForm.tsx            (client component — seat count + persona mix; triggers save)
```

### Task 3.2-A: Builder shell layout

- [ ] **Step 1: Create `app/scenarios/[id]/layout.tsx`**

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import ScenarioHeader from '@/components/scenarios/ScenarioHeader';
import ScenarioRail from '@/components/scenarios/ScenarioRail';

const TABS = [
  { href: 'notes', label: 'Notes' },
  { href: 'training', label: 'Training & White-glove' },
  { href: 'service', label: 'Service' },
];

export default async function ScenarioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const session = await auth();
  const repo = new ScenarioRepository(db);
  const scenario = await repo.findById(params.id);
  if (!scenario) notFound();

  if (session?.user.role === 'SALES' && scenario.ownerId !== session.user.id) {
    notFound();
  }

  const userRole = session?.user.role ?? 'SALES';

  return (
    <div className="flex flex-col min-h-screen">
      <ScenarioHeader scenario={scenario} userRole={userRole} />
      <div className="flex flex-1 overflow-hidden">
        <ScenarioRail scenario={scenario} userRole={userRole} computeResult={null} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <nav className="border-b px-6 flex gap-1 text-sm shrink-0">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={`/scenarios/${params.id}/${t.href}`}
                className="px-3 py-3 font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent aria-[current=page]:border-slate-900 aria-[current=page]:text-slate-900"
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
```

Note: The `aria-current="page"` attribute on the active tab link requires middleware to inject `x-pathname` (already done in Phase 2.1-B) so the layout can derive the active tab server-side. Alternatively, use a client component for the tab nav that reads `usePathname()`.

- [ ] **Step 2: Create `components/scenarios/ScenarioHeader.tsx`**

```tsx
import type { Scenario } from '@prisma/client';
import type { Role } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function ScenarioHeader({
  scenario,
  userRole,
}: {
  scenario: Scenario;
  userRole: Role;
}) {
  return (
    <header className="border-b bg-white px-6 py-4 flex items-center justify-between shrink-0">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{scenario.name}</h1>
          <Badge variant="secondary">{scenario.status}</Badge>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">
          {scenario.customerName} · {scenario.contractMonths} months
        </p>
      </div>
      <div className="flex items-center gap-2">
        {/* Archive and Generate Quote are wired in Phase 3.5 */}
        <Button variant="outline" size="sm" disabled>
          Archive
        </Button>
        <Button size="sm" disabled data-testid="generate-quote-btn">
          Generate Quote
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create `components/scenarios/ScenarioRail.tsx`**

```tsx
'use client';
import type { Scenario } from '@prisma/client';
import type { Role } from '@prisma/client';
import type { ComputeResult } from '@/lib/engine/types';

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

interface Props {
  scenario: { contractMonths: number };
  userRole: Role;
  computeResult: ComputeResult | null;
}

export default function ScenarioRail({ computeResult, userRole }: Props) {
  const t = computeResult?.totals;
  return (
    <aside
      className="w-72 shrink-0 border-r bg-slate-50 p-5 sticky top-0 h-screen overflow-auto"
      aria-label="Deal summary"
    >
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
        Deal Summary
      </p>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Contract revenue</dt>
          <dd className="font-medium" data-testid="rail-contract-revenue">
            {t ? formatCents(t.contractRevenueCents) : '—'}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Contribution margin</dt>
          <dd className="font-medium">{t ? formatCents(t.contributionMarginCents) : '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Commissions</dt>
          <dd className="font-medium">
            {t
              ? formatCents(
                  computeResult!.commissions.reduce((s, c) => s + c.commissionAmountCents, 0),
                )
              : '—'}
          </dd>
        </div>
        <div className="flex justify-between border-t pt-3">
          <dt className="font-medium">Net margin</dt>
          <dd className="font-semibold" data-testid="rail-net-margin">
            {t ? `${formatCents(t.netMarginCents)} (${(t.marginPctNet * 100).toFixed(1)}%)` : '—'}
          </dd>
        </div>
      </dl>
      {/* Rail warnings — neutral copy for SALES, raw message for ADMIN */}
      {computeResult?.warnings.map((w) => (
        <div
          key={w.railId}
          className={`mt-3 rounded p-2 text-xs leading-snug ${
            w.severity === 'hard' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {userRole === 'SALES'
            ? w.severity === 'hard'
              ? 'This deal is below an approved floor — admin review required before quoting.'
              : 'This deal is approaching an approved floor — consider adjusting.'
            : w.message}
        </div>
      ))}
    </aside>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/scenarios/[id]/layout.tsx app/scenarios/[id]/page.tsx components/scenarios/ScenarioHeader.tsx components/scenarios/ScenarioRail.tsx
git commit -m "feat(builder): scenario layout shell with header, tab nav, and static sticky rail"
```

---

### Task 3.2-B: Notes tab

- [ ] **Step 1: Create `components/scenarios/PersonaMixSliders.tsx`**

Client component. Props: `personas: { id, name }[]`, `initialMix: { personaId, pct }[]`, `onChange: (mix: { personaId: string; pct: number }[]) => void`.

The component maintains local slider state. When slider N changes, the remaining percentage is distributed across the other sliders proportionally; then the last slider is snapped so the total equals exactly 100. This prevents the mix from ever being off-100 in the UI state that feeds the compute debounce (the server action additionally validates on save).

```tsx
'use client';
import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

interface Persona {
  id: string;
  name: string;
}
interface Mix {
  personaId: string;
  pct: number;
}

export default function PersonaMixSliders({
  personas,
  initialMix,
  onChange,
}: {
  personas: Persona[];
  initialMix: Mix[];
  onChange: (mix: Mix[]) => void;
}) {
  const seed: Mix[] = personas.map((p) => {
    const found = initialMix.find((m) => m.personaId === p.id);
    return { personaId: p.id, pct: found?.pct ?? Math.floor(100 / personas.length) };
  });

  const [mix, setMix] = useState<Mix[]>(seed);

  function handleChange(changedId: string, newPct: number) {
    const others = mix.filter((m) => m.personaId !== changedId);
    const remainingBudget = 100 - newPct;
    const otherTotal = others.reduce((s, m) => s + m.pct, 0);
    const adjusted: Mix[] = others.map((m) => ({
      ...m,
      pct:
        otherTotal === 0
          ? Math.floor(remainingBudget / others.length)
          : Math.round((m.pct / otherTotal) * remainingBudget),
    }));
    // Snap the first other to absorb rounding drift
    const snapTotal = adjusted.reduce((s, m) => s + m.pct, 0) + newPct;
    if (adjusted.length > 0 && snapTotal !== 100) {
      adjusted[0].pct = Math.max(0, adjusted[0].pct + (100 - snapTotal));
    }
    const newMix = [...adjusted, { personaId: changedId, pct: newPct }].sort(
      (a, b) =>
        personas.findIndex((p) => p.id === a.personaId) -
        personas.findIndex((p) => p.id === b.personaId),
    );
    setMix(newMix);
    onChange(newMix);
  }

  const total = mix.reduce((s, m) => s + m.pct, 0);

  return (
    <div className="space-y-4">
      {personas.map((p) => {
        const m = mix.find((x) => x.personaId === p.id);
        return (
          <div key={p.id} className="space-y-1">
            <div className="flex justify-between text-sm">
              <Label>{p.name}</Label>
              <span className="text-slate-500">{m?.pct ?? 0}%</span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[m?.pct ?? 0]}
              onValueChange={([v]) => handleChange(p.id, v)}
            />
          </div>
        );
      })}
      <p className={`text-xs ${total === 100 ? 'text-slate-400' : 'text-red-600 font-medium'}`}>
        Mix total: {total}%{total !== 100 ? ' — must equal 100%' : ''}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/scenarios/[id]/notes/page.tsx`**

Server component. Fetches the `ScenarioSaaSConfig` for the Notes product (the seeded `SAAS_USAGE` product) and the product's personas. Passes them to `NotesTabForm`.

```tsx
import { db } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import { notFound } from 'next/navigation';

export default async function NotesTabPage({ params }: { params: { id: string } }) {
  const repo = new ScenarioRepository(db);
  const scenario = await repo.findById(params.id);
  if (!scenario) notFound();

  // The Notes product is the seeded SAAS_USAGE product named "Notes"
  const notesProduct = await db.product.findFirst({
    where: { kind: 'SAAS_USAGE', isActive: true, name: 'Notes' },
    include: { personas: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!notesProduct) return <p className="text-sm text-slate-500">No SaaS product configured.</p>;

  const saasConfig = scenario.saasConfigs.find((c) => c.productId === notesProduct.id);

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold mb-4">Notes</h2>
      <NotesTabForm
        scenarioId={params.id}
        productId={notesProduct.id}
        personas={notesProduct.personas.map((p) => ({ id: p.id, name: p.name }))}
        initialSeatCount={saasConfig?.seatCount ?? 0}
        initialMix={
          saasConfig ? (saasConfig.personaMix as { personaId: string; pct: number }[]) : []
        }
      />
    </div>
  );
}
```

`NotesTabForm` is a client component that renders seat count input + `PersonaMixSliders` + a save button that calls `upsertSaaSConfigAction` via a hidden form.

- [ ] **Step 3: Create `app/scenarios/[id]/notes/actions.ts`**

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import { ScenarioSaaSConfigRepository } from '@/lib/db/repositories/scenario-saas-config';
import { ScenarioLaborLineRepository } from '@/lib/db/repositories/scenario-labor-line';
import { ScenarioService } from '@/lib/services/scenario';
import { ValidationError } from '@/lib/utils/errors';

export async function upsertSaaSConfigAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const service = new ScenarioService(
    new ScenarioRepository(db),
    new ScenarioSaaSConfigRepository(db),
    new ScenarioLaborLineRepository(db),
  );

  try {
    const personaMix = JSON.parse(String(formData.get('personaMix') ?? '[]'));
    await service.upsertSaaSConfig({
      scenarioId: String(formData.get('scenarioId')),
      productId: String(formData.get('productId')),
      seatCount: Number(formData.get('seatCount')),
      personaMix,
      discountOverridePct: formData.get('discountOverridePct')
        ? Number(formData.get('discountOverridePct'))
        : null,
    });
    const scenarioId = String(formData.get('scenarioId'));
    revalidatePath(`/scenarios/${scenarioId}/notes`);
    return { success: true };
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
}
```

- [ ] **Step 4: TypeScript check and commit**

```bash
npx tsc --noEmit
git add app/scenarios/[id]/notes/ components/scenarios/PersonaMixSliders.tsx components/scenarios/NotesTabForm.tsx
git commit -m "feat(builder): Notes tab with seat count, persona mix sliders, upsert action"
```

---

## Phase 3.3 — Training/White-glove + Service Tabs

**Goal:** Training/White-glove tab has an SKU picker + qty input + custom line item option. Service tab has a department picker + hours input. Both write through `ScenarioLaborLineRepository` via server actions. Cost columns are hidden from the `SALES` role.

### File map

```
app/
  scenarios/
    [id]/
      training/
        page.tsx
        actions.ts
      service/
        page.tsx
        actions.ts

components/
  scenarios/
    LaborLineTable.tsx          (shared — renders lines; cost column gated by userRole)
    SKUPickerForm.tsx           (Training: SKU dropdown + qty + optional custom description)
    DepartmentPickerForm.tsx    (Service: department select + hours input)
```

### Task 3.3-A: Shared `LaborLineTable` component

- [ ] **Step 1: Create `components/scenarios/LaborLineTable.tsx`**

```tsx
'use client';
import type { ScenarioLaborLine } from '@prisma/client';
import type { Role } from '@prisma/client';
import Decimal from 'decimal.js';

export default function LaborLineTable({
  lines,
  userRole,
  deleteAction,
}: {
  lines: ScenarioLaborLine[];
  userRole: Role;
  deleteAction: (id: string) => Promise<void>;
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-slate-400 mt-4">No lines added yet.</p>;
  }

  return (
    <table className="w-full text-sm mt-4">
      <thead>
        <tr className="border-b text-left text-slate-500">
          <th className="pb-2 font-medium">Line item</th>
          <th className="pb-2 font-medium text-right">Qty</th>
          <th className="pb-2 font-medium">Unit</th>
          {userRole === 'ADMIN' && <th className="pb-2 font-medium text-right">Cost/unit</th>}
          <th className="pb-2 font-medium text-right">Rev/unit</th>
          {userRole === 'ADMIN' && <th className="pb-2 font-medium text-right">Cost total</th>}
          <th className="pb-2 font-medium text-right">Rev total</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const qty = new Decimal(l.qty.toString());
          const rev = new Decimal(l.revenuePerUnitUsd.toString());
          const cost = new Decimal(l.costPerUnitUsd.toString());
          const label = l.customDescription ?? '(line item)';
          return (
            <tr key={l.id} className="border-b last:border-0">
              <td className="py-2">{label}</td>
              <td className="py-2 text-right">{qty.toFixed(2)}</td>
              <td className="py-2 text-slate-500">{l.unit}</td>
              {userRole === 'ADMIN' && <td className="py-2 text-right">${cost.toFixed(2)}</td>}
              <td className="py-2 text-right">${rev.toFixed(2)}</td>
              {userRole === 'ADMIN' && (
                <td className="py-2 text-right">${qty.mul(cost).toFixed(2)}</td>
              )}
              <td className="py-2 text-right">${qty.mul(rev).toFixed(2)}</td>
              <td className="py-2 pl-4">
                <form action={deleteAction.bind(null, l.id)}>
                  <button type="submit" className="text-red-500 text-xs hover:underline">
                    Remove
                  </button>
                </form>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/scenarios/LaborLineTable.tsx
git commit -m "feat(builder): shared LaborLineTable with role-gated cost columns"
```

---

### Task 3.3-B: Training/White-glove tab

**Design details:** SKU picker dropdown shows active `LaborSKU` records for the Training & White-glove product. Selecting a SKU pre-populates `costPerUnitUsd` from `LaborSKU.costPerUnitUsd` and `revenuePerUnitUsd` from `LaborSKU.defaultRevenueUsd`. Sales can override the revenue field; the cost field is hidden. Custom line item bypasses SKU lookup entirely — sales enters description + qty + unit + revenue per unit.

- [ ] **Step 1: Create `app/scenarios/[id]/training/page.tsx`**

Server component. Fetches existing `ScenarioLaborLine` rows for the Training product and all active LaborSKUs for that product. Renders the table + add-from-SKU form + custom line item form. Passes `userRole` from session.

- [ ] **Step 2: Create `app/scenarios/[id]/training/actions.ts`**

Three server actions:

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { ScenarioLaborLineRepository } from '@/lib/db/repositories/scenario-labor-line';
import Decimal from 'decimal.js';

export async function addTrainingLineFromSKU(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const skuId = String(formData.get('skuId'));
  const sku = await db.laborSKU.findUnique({ where: { id: skuId } });
  if (!sku) return { error: 'SKU not found' };

  const repo = new ScenarioLaborLineRepository(db);
  await repo.create({
    scenarioId: String(formData.get('scenarioId')),
    productId: String(formData.get('productId')),
    skuId,
    customDescription: sku.name,
    qty: new Decimal(String(formData.get('qty') ?? '1')),
    unit: sku.unit,
    costPerUnitUsd: new Decimal(sku.costPerUnitUsd.toString()),
    revenuePerUnitUsd: new Decimal(
      formData.get('revenuePerUnit')
        ? String(formData.get('revenuePerUnit'))
        : sku.defaultRevenueUsd.toString(),
    ),
  });
  revalidatePath(`/scenarios/${formData.get('scenarioId')}/training`);
}

export async function addCustomTrainingLine(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const repo = new ScenarioLaborLineRepository(db);
  await repo.create({
    scenarioId: String(formData.get('scenarioId')),
    productId: String(formData.get('productId')),
    customDescription: String(formData.get('description')),
    qty: new Decimal(String(formData.get('qty'))),
    unit: String(formData.get('unit')),
    costPerUnitUsd: new Decimal('0'), // cost not entered by sales; admin fills if needed
    revenuePerUnitUsd: new Decimal(String(formData.get('revenuePerUnit'))),
  });
  revalidatePath(`/scenarios/${formData.get('scenarioId')}/training`);
}

export async function deleteTrainingLine(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  const repo = new ScenarioLaborLineRepository(db);
  await repo.delete(id);
}
```

- [ ] **Step 3: Commit**

```bash
git add app/scenarios/[id]/training/ components/scenarios/SKUPickerForm.tsx
git commit -m "feat(builder): Training/White-glove tab with SKU picker and custom line items"
```

---

### Task 3.3-C: Service tab

**Design details:** Department picker + hours input. `revenuePerUnitUsd` = department's `billRatePerHour` (from `DepartmentBillRate`). `costPerUnitUsd` = computed loaded rate (derived on server from employees + burdens — not shown to sales). Unit is always `"hours"`.

- [ ] **Step 1: Create `app/scenarios/[id]/service/page.tsx`**

Server component. Fetches existing service labor lines and all active departments with bill rates. Renders `LaborLineTable` (cost hidden for sales) + `DepartmentPickerForm`.

- [ ] **Step 2: Create `app/scenarios/[id]/service/actions.ts`**

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { ScenarioLaborLineRepository } from '@/lib/db/repositories/scenario-labor-line';
import { fetchRateSnapshot } from '@/lib/services/compute-snapshot';
import Decimal from 'decimal.js';

export async function addServiceLine(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');

  const departmentId = String(formData.get('departmentId'));
  const hours = new Decimal(String(formData.get('hours')));
  const scenarioId = String(formData.get('scenarioId'));
  const productId = String(formData.get('productId'));

  // Fetch loaded rate and bill rate from the snapshot assembler
  const snapshot = await fetchRateSnapshot(db, [productId]);
  const dept = snapshot.departments[departmentId];
  if (!dept) return { error: 'Department not found' };

  const repo = new ScenarioLaborLineRepository(db);
  await repo.create({
    scenarioId,
    productId,
    departmentId,
    customDescription: `${dept.name} — ${hours.toFixed(1)} hrs`,
    qty: hours,
    unit: 'hours',
    costPerUnitUsd: dept.loadedRatePerHourUsd,
    revenuePerUnitUsd: dept.billRatePerHourUsd,
  });
  revalidatePath(`/scenarios/${scenarioId}/service`);
}

export async function deleteServiceLine(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  await new ScenarioLaborLineRepository(db).delete(id);
}
```

- [ ] **Step 3: Commit**

```bash
git add app/scenarios/[id]/service/ components/scenarios/DepartmentPickerForm.tsx
git commit -m "feat(builder): Service tab with department picker, hours, role-gated cost"
```

---

## Phase 3.4 — Live Recalc + Bundle Apply

**Goal:** Replace the static sticky rail with live compute. Any input change on any tab triggers a debounced `POST /api/compute`; the response updates the rail. Bundle picker applies a bundle's stored configs into the scenario's SaaS/labor lines and sets `Scenario.appliedBundleId`.

### Task 3.4-A: Live compute rail

**Architecture shift:** The builder layout becomes a hybrid. A new client component `ScenarioBuilderClient` holds the `ComputeResult` state and provides it to `ScenarioRail`. Tab forms reach the compute trigger via a React context (`ScenarioComputeContext`).

- [ ] **Step 1: Create `components/scenarios/ScenarioComputeContext.tsx`**

```tsx
'use client';
import { createContext, useContext } from 'react';

interface ScenarioComputeContextValue {
  triggerCompute: (
    saasConfigs: {
      productId: string;
      seatCount: number;
      personaMix: { personaId: string; pct: number }[];
      discountOverridePct?: number | null;
    }[],
    laborLines: {
      productId: string;
      skuId?: string | null;
      departmentId?: string | null;
      qty: number;
      unit: string;
      costPerUnitUsd: number;
      revenuePerUnitUsd: number;
    }[],
  ) => void;
}

export const ScenarioComputeContext = createContext<ScenarioComputeContextValue>({
  triggerCompute: () => {},
});

export function useScenarioCompute() {
  return useContext(ScenarioComputeContext);
}
```

- [ ] **Step 2: Create `components/scenarios/ScenarioBuilderClient.tsx`**

```tsx
'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import ScenarioRail from './ScenarioRail';
import { ScenarioComputeContext } from './ScenarioComputeContext';
import type { ComputeResult } from '@/lib/engine/types';
import type { Role } from '@prisma/client';

const DEBOUNCE_MS = 300;

interface SaaSConfigInput {
  productId: string;
  seatCount: number;
  personaMix: { personaId: string; pct: number }[];
  discountOverridePct?: number | null;
}

interface LaborLineInput {
  productId: string;
  skuId?: string | null;
  departmentId?: string | null;
  qty: number;
  unit: string;
  costPerUnitUsd: number;
  revenuePerUnitUsd: number;
}

interface Props {
  contractMonths: number;
  initialSaaSConfigs: SaaSConfigInput[];
  initialLaborLines: LaborLineInput[];
  userRole: Role;
  scenario: { contractMonths: number };
  children: React.ReactNode;
}

export default function ScenarioBuilderClient({
  contractMonths,
  initialSaaSConfigs,
  initialLaborLines,
  userRole,
  scenario,
  children,
}: Props) {
  const [computeResult, setComputeResult] = useState<ComputeResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  const triggerCompute = useCallback(
    (saasConfigs: SaaSConfigInput[], laborLines: LaborLineInput[]) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        try {
          const res = await fetch('/api/compute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contractMonths, saasConfigs, laborLines }),
            signal: abortRef.current.signal,
          });
          if (res.ok) setComputeResult(await res.json());
        } catch (e) {
          if ((e as Error).name !== 'AbortError') throw e;
        }
      }, DEBOUNCE_MS);
    },
    [contractMonths],
  );

  // Fire compute on mount with the initial persisted state
  useEffect(() => {
    triggerCompute(initialSaaSConfigs, initialLaborLines);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ScenarioComputeContext.Provider value={{ triggerCompute }}>
      <div className="flex flex-1 overflow-hidden">
        <ScenarioRail scenario={scenario} userRole={userRole} computeResult={computeResult} />
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </ScenarioComputeContext.Provider>
  );
}
```

- [ ] **Step 3: Update `app/scenarios/[id]/layout.tsx`**

Replace the static rail + content div with `ScenarioBuilderClient`, passing the scenario's persisted `saasConfigs` and `laborLines` as `initialSaaSConfigs` and `initialLaborLines` props. The layout already fetches the full scenario with `include: { saasConfigs, laborLines }` via `findById`, so the data is available.

- [ ] **Step 4: Update `NotesTabForm` to call `triggerCompute` on input change**

After each seat count change or persona mix slider movement (via `PersonaMixSliders` `onChange`), call `useScenarioCompute().triggerCompute` with the current form state. This fires the debounced compute without requiring a save. After save (server action resolves), trigger another compute with the freshly saved state.

- [ ] **Step 5: Verify live recalc (dev server)**

```bash
npm run dev
```

Navigate to a scenario. Adjust seat count — confirm the rail values update after 300ms. Adjust persona mix — confirm rail updates. Confirm cost numbers are absent for sales role.

- [ ] **Step 6: Commit**

```bash
git add components/scenarios/ScenarioBuilderClient.tsx components/scenarios/ScenarioComputeContext.tsx
git commit -m "feat(builder): live compute rail with 300ms debounce and AbortController via /api/compute"
```

---

### Task 3.4-B: Bundle apply

**Design from spec:** Bundle picker shows active bundles. Applying a bundle:

1. Iterates the bundle's `BundleItem[]`. For each SaaS item, upserts `ScenarioSaaSConfig`. For each labor item, creates `ScenarioLaborLine` rows.
2. Sets `Scenario.appliedBundleId`.

Unapplying: clears `appliedBundleId` only — leaves materialised lines in place (sales decides whether to edit or remove them).

- [ ] **Step 1: Add `applyBundle` method to `ScenarioService`**

```typescript
async applyBundle(
  scenarioId: string,
  bundleId: string,
  requestingUserId: string,
  requestingUserRole: 'ADMIN' | 'SALES'
): Promise<void> {
  const scenario = await this.scenarioRepo.findById(scenarioId);
  if (!scenario) throw new NotFoundError('Scenario', scenarioId);
  if (requestingUserRole !== 'ADMIN' && scenario.ownerId !== requestingUserId) {
    throw new ValidationError('You do not have permission to modify this scenario');
  }

  const bundle = await this.bundleRepo.findById(bundleId);
  if (!bundle) throw new NotFoundError('Bundle', bundleId);

  for (const item of bundle.items) {
    const config = item.config as Record<string, unknown>;
    if (item.product?.kind === 'SAAS_USAGE') {
      // BundleSaaSConfigSchema from Phase 2.4-B
      const saasConfig = BundleSaaSConfigSchema.parse(config);
      await this.saasConfigRepo.upsert({
        scenarioId,
        productId: item.productId,
        seatCount: saasConfig.seatCount,
        personaMix: saasConfig.personaMix,
        discountOverridePct:
          saasConfig.discountOverridePct != null
            ? new Decimal(saasConfig.discountOverridePct)
            : null,
      });
    } else {
      // Labor items — create lines from bundle config
      const laborConfig = BundleLaborConfigSchema.parse(config);
      for (const line of laborConfig.lines) {
        await this.laborLineRepo.create({
          scenarioId,
          productId: item.productId,
          skuId: 'skuId' in line ? line.skuId : undefined,
          departmentId: 'departmentId' in line ? line.departmentId : undefined,
          qty: new Decimal(line.qty),
          unit: line.unit ?? 'unit',
          costPerUnitUsd: new Decimal(line.costPerUnitUsd ?? 0),
          revenuePerUnitUsd: new Decimal(line.revenuePerUnitUsd ?? 0),
        });
      }
    }
  }

  await this.scenarioRepo.update(scenarioId, { appliedBundleId: bundleId });
}
```

`ScenarioService` constructor receives an additional `bundleRepo: BundleRepository` (from Phase 2.4-B). The Zod schemas `BundleSaaSConfigSchema` and `BundleLaborConfigSchema` are imported from `lib/services/bundle.ts`.

- [ ] **Step 2: Create `app/scenarios/[id]/actions.ts`**

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import { ScenarioSaaSConfigRepository } from '@/lib/db/repositories/scenario-saas-config';
import { ScenarioLaborLineRepository } from '@/lib/db/repositories/scenario-labor-line';
import { BundleRepository } from '@/lib/db/repositories/bundle';
import { ScenarioService } from '@/lib/services/scenario';

export async function applyBundleAction(scenarioId: string, bundleId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  const service = new ScenarioService(
    new ScenarioRepository(db),
    new ScenarioSaaSConfigRepository(db),
    new ScenarioLaborLineRepository(db),
    new BundleRepository(db),
  );
  await service.applyBundle(scenarioId, bundleId, session.user.id, session.user.role);
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function unapplyBundleAction(scenarioId: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  await new ScenarioRepository(db).update(scenarioId, { appliedBundleId: null });
  revalidatePath(`/scenarios/${scenarioId}`);
}
```

- [ ] **Step 3: Create `components/scenarios/BundlePicker.tsx`**

Client component. Dropdown of active bundles fetched server-side and passed as props. On selection + "Apply" click, calls `applyBundleAction` via a form action. Shows the currently applied bundle name (from `scenario.appliedBundleId`) with an "Unapply" link.

- [ ] **Step 4: Commit**

```bash
git add components/scenarios/BundlePicker.tsx app/scenarios/[id]/actions.ts
git commit -m "feat(builder): bundle apply writes saas configs and labor lines, sets appliedBundleId"
```

---

## Phase 3.5 — Polish + Smoke Test

**Goal:** Wire the remaining actions (Generate Quote stub, archive from list), audit all sales-role copy for neutrality per the design spec's "sales trust" requirement, and write the Playwright smoke test covering the end-to-end happy path.

### Task 3.5-A: Generate Quote stub + Archive action

- [ ] **Step 1: Wire "Generate Quote" button**

Create `app/api/quotes/generate/route.ts` — a stub `POST` handler that:

1. Authenticates the session.
2. Validates `scenarioId` is present in the body.
3. Returns `{ status: 'pending', message: 'Quote generation coming in Phase 4' }`.

In `ScenarioHeader`, replace the disabled "Generate Quote" `<Button>` with a client component that calls this endpoint and switches to a "Generating..." disabled state. A toast (shadcn `useToast`) confirms the stub fired.

- [ ] **Step 2: Wire "Archive" action**

Create `archiveScenarioAction(id: string)` server action in `app/scenarios/actions.ts`. Delegates to `ScenarioService.archiveScenario`. Revalidates `/scenarios`. Add an Archive button per row on the list page (admin always; sales for their own scenarios only — conditional on `scenario.ownerId === session.user.id`).

- [ ] **Step 3: Commit**

```bash
git add app/api/quotes/generate/ app/scenarios/actions.ts
git commit -m "feat(scenarios): Generate Quote stub endpoint; archive action wired from list"
```

---

### Task 3.5-B: Sales-role copy audit

Review every component that renders when `userRole === 'SALES'`. Confirm:

- `ScenarioRail`: no raw margin percentage thresholds, no cost numbers, no commission rule names. Rail warnings use: "This deal is below an approved floor — admin review required before quoting." (hard) and "This deal is approaching an approved floor — consider adjusting." (soft). No raw `measured` value or `threshold` value displayed.
- `LaborLineTable`: `Cost/unit` and `Cost total` columns absent. Table header has no "Cost" string visible.
- `NotesTabPage`: no vendor-level cost breakdown rendered for sales (the breakdown panel showing per-vendor cost-per-seat can be in a collapsible section gated by admin role).
- `ScenarioHeader`: no margin % in the header for sales.

For any violation found, fix inline and include in this commit.

- [ ] **Step 1: Audit and fix**

- [ ] **Step 2: Commit**

```bash
git add components/scenarios/
git commit -m "fix(builder): audit and enforce sales-neutral copy throughout builder UI"
```

---

### Task 3.5-C: Playwright smoke test

- [ ] **Step 1: Configure Playwright**

If `playwright.config.ts` does not already exist (it was deferred from Phase 1), initialise it:

```bash
npx playwright install chromium
```

`playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true },
});
```

- [ ] **Step 2: Add test-login endpoint (dev/test only)**

Create `app/api/auth/test-login/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  // Sets a test session cookie. Implementation depends on NextAuth session strategy.
  // Use a JWT strategy override or a shared test secret to forge a minimal session.
  const role = req.nextUrl.searchParams.get('role') ?? 'SALES';
  // ... session cookie logic ...
  return NextResponse.redirect(new URL('/scenarios', req.url));
}
```

This endpoint must be unreachable in production. Verify with a unit test or CI step.

- [ ] **Step 3: Write `tests/e2e/scenario-builder.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Scenario builder — sales role', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/api/auth/test-login?role=SALES');
  });

  test('creates a scenario and fills all three tabs', async ({ page }) => {
    // Create
    await page.goto('/scenarios/new');
    await page.fill('[name="name"]', 'Smoke Test Deal');
    await page.fill('[name="customerName"]', 'E2E Corp');
    await page.fill('[name="contractMonths"]', '12');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/scenarios\/[^/]+\/notes/);

    // Notes tab
    await page.fill('[name="seatCount"]', '25');
    await page.click('button:text("Save")');

    // Training tab
    await page.click('a:text("Training")');
    await page.selectOption('[name="skuId"]', { index: 1 });
    await page.fill('[name="qty"]', '2');
    await page.click('button:text("Add line")');
    await expect(page.locator('table tbody tr')).toHaveCount(1);

    // Service tab
    await page.click('a:text("Service")');
    await page.selectOption('[name="departmentId"]', { index: 1 });
    await page.fill('[name="hours"]', '40');
    await page.click('button:text("Add line")');
    await expect(page.locator('table tbody tr')).toHaveCount(1);

    // Apply a bundle
    await page.selectOption('[name="bundleId"]', { index: 1 });
    await page.click('button:text("Apply bundle")');

    // Verify live rail updated
    await expect(page.locator('[data-testid="rail-net-margin"]')).not.toHaveText('—');

    // Generate Quote stub
    await page.click('[data-testid="generate-quote-btn"]');
    await expect(page.locator('[data-testid="generate-quote-btn"]:disabled')).toBeVisible();
  });

  test('sales user cannot see cost columns in Training tab', async ({ page }) => {
    await page.goto('/scenarios/new');
    await page.fill('[name="name"]', 'Cost Visibility Test');
    await page.fill('[name="customerName"]', 'Corp');
    await page.fill('[name="contractMonths"]', '12');
    await page.click('button[type="submit"]');
    await page.click('a:text("Training")');
    await expect(page.locator('text=Cost/unit')).not.toBeVisible();
    await expect(page.locator('text=Cost total')).not.toBeVisible();
  });
});

test.describe('Scenario list — admin role', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/api/auth/test-login?role=ADMIN');
  });

  test('admin sees all scenarios', async ({ page }) => {
    await page.goto('/scenarios');
    await expect(page.locator('h1')).toContainText('Scenarios');
    await expect(page.locator('button:text("New scenario")')).toBeVisible();
  });
});
```

- [ ] **Step 4: Run smoke tests**

```bash
npx playwright test tests/e2e/scenario-builder.spec.ts
```

Expected: All pass (requires a running dev server with seed data including at least one active product, one LaborSKU, one department, and one active bundle).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/scenario-builder.spec.ts app/api/auth/test-login/ playwright.config.ts
git commit -m "test(e2e): Playwright smoke — scenario builder happy path; sales cost visibility"
```

---

## Parallel Workstream — Integration Test Wiring

**Goal:** Wire CI to run the 67 currently-skipped `it.skip` repository integration tests against a real Postgres instance. This workstream can start immediately after Phase 3.0 completes.

**Handoff points:**

- **Start gate:** Phase 3.0 complete. All four scenario repositories exist with test files.
- **Input needed from main workstream:** test DB connection string pattern; which seed fixtures are required for FK constraints (minimum: a `User` row for `ownerId`, `Product` rows for `productId` in scenario tests).
- **Output to main workstream:** CI passes with integration tests green; `npm run test:integration` is documented in `package.json`.

**Steps:**

- [ ] **Create `docker-compose.test.yml`** for local integration test runs:

```yaml
version: '3.8'
services:
  test-postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: ninjapricetest
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5433:5432'
```

- [ ] **Create `tests/fixtures/db.ts`** with shared seed helpers:

```typescript
import { PrismaClient } from '@prisma/client';

export async function seedTestUser(
  db: PrismaClient,
  email: string,
  role: 'ADMIN' | 'SALES' = 'ADMIN',
) {
  return db.user.upsert({
    where: { email },
    create: { email, name: email.split('@')[0], role },
    update: {},
  });
}

export async function seedTestProduct(db: PrismaClient, name = '__test_saas_product__') {
  return db.product.upsert({
    where: { name },
    create: { name, kind: 'SAAS_USAGE', isActive: true },
    update: {},
  });
}
```

- [ ] **Add `integration` project to `vitest.config.ts`:**

```typescript
// In defineConfig, add:
projects: [
  // ... existing unit project
  {
    name: 'integration',
    include: ['lib/db/repositories/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }, // prevent parallel DB contention
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL! },
  },
],
```

- [ ] **Unskip tests:** change `it.skip(...)` → `it(...)` in all repository test files. Run against local test DB to confirm they pass.

- [ ] **Wire CI** in `.github/workflows/ci.yml`:

```yaml
integration-tests:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_DB: ninjapricetest
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: postgres
      ports: ['5432:5432']
      options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '20' }
    - run: npm ci
    - run: npx prisma migrate deploy
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ninjapricetest
    - run: npx vitest run --project integration
      env:
        TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ninjapricetest
```

- [ ] **Commit**

```bash
git add docker-compose.test.yml tests/fixtures/db.ts vitest.config.ts .github/workflows/ci.yml
git commit -m "ci: wire integration test suite against real Postgres; unskip 67 repo tests"
```

---

## File Map Summary

All files created or modified across Phase 3:

```
lib/
  db/
    repositories/
      scenario.ts                    (+ scenario.test.ts)
      scenario-saas-config.ts        (+ scenario-saas-config.test.ts)
      scenario-labor-line.ts         (+ scenario-labor-line.test.ts)
      user.ts                        (setRole P2025 fix + test)
      index.ts                       (updated barrel)
  services/
    scenario.ts                      (+ scenario.test.ts)
    compute-snapshot.ts              (+ compute-snapshot.test.ts)
    index.ts                         (updated barrel)

app/
  api/
    compute/
      route.ts
    quotes/
      generate/
        route.ts                     (stub)
    auth/
      test-login/
        route.ts                     (dev/test only — guarded in production)
  scenarios/
    page.tsx
    actions.ts                       (archiveScenarioAction)
    new/
      page.tsx
      actions.ts
    [id]/
      layout.tsx
      page.tsx                       (redirect to /notes)
      actions.ts                     (applyBundleAction, unapplyBundleAction)
      notes/
        page.tsx
        actions.ts
      training/
        page.tsx
        actions.ts
      service/
        page.tsx
        actions.ts

components/
  scenarios/
    ScenarioHeader.tsx
    ScenarioRail.tsx
    ScenarioBuilderClient.tsx
    ScenarioComputeContext.tsx
    PersonaMixSliders.tsx
    NotesTabForm.tsx
    LaborLineTable.tsx
    SKUPickerForm.tsx
    DepartmentPickerForm.tsx
    BundlePicker.tsx

tests/
  e2e/
    scenario-builder.spec.ts
  fixtures/
    db.ts

docker-compose.test.yml
playwright.config.ts
vitest.config.ts                     (integration project added)
.github/workflows/ci.yml            (integration-tests job added)
```

---

## Risks

| Risk                                                                                                                                                        | Likelihood      | Impact | Mitigation                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role staleness from JWT sessions — a user's role can change server-side while their JWT remains valid for the session lifetime                              | Low             | Medium | Accepted for v1. Session lifetime is short (NextAuth default). If it bites in practice, add a per-request DB role check inside sensitive server actions as a follow-up.                         |
| `ALLOWED_EMAIL_DOMAIN` must be set in prod deploy config before go-live                                                                                     | High (ops item) | High   | Add to Railway deploy checklist and README. The NextAuth `signIn` callback should throw if the env var is missing to prevent silent open sign-in.                                               |
| `microsoftSub` seed gap — seeded users aren't linked to Entra accounts until first sign-in                                                                  | Medium          | Low    | Documented in `prisma/seed.ts` (Phase 2.0-G). Not a production safety issue; the gap only affects the seeded admin's first login sequence.                                                      |
| Live compute hammers `/api/compute` even with 300ms debounce if each request takes longer than 300ms                                                        | Medium          | Low    | Implemented with `AbortController` — in-flight request is cancelled before the next one fires. If p95 compute latency remains < 100ms (expected for v1 scenario sizes), queuing is a non-issue. |
| Bundle apply materialises lines without validation of referenced entities — a deleted SKU or department silently omits lines                                | Medium          | Low    | `applyBundle` in `ScenarioService` should validate all entity references and wrap the writes in a Prisma transaction. If any reference is missing, roll back and throw `ValidationError`.       |
| Test-login endpoint ships to production and allows role impersonation                                                                                       | High            | High   | Guarded by `if (process.env.NODE_ENV === 'production') return 404`. Verified by a CI assertion that hits the endpoint in a production-mode build and expects 404.                               |
| `personaMix` JSON round-trip — Prisma returns `ScenarioSaaSConfig.personaMix` as `unknown`; unsafe type assertions could fail silently if the shape changes | Low             | Medium | Validate with `PersonaMixSchema` (Zod) whenever reading `personaMix` in the compute snapshot assembler. Never assume the shape from a type cast.                                                |

---

## Milestones

| Milestone                                             | Definition of done                                                                                                                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1: Scaffolding complete (3.0)**                    | `UserRepository.setRole` throws `NotFoundError` on P2025; all four scenario repositories and `ScenarioService` pass tests; `POST /api/compute` returns a valid `ComputeResult`; `npx vitest run`, `npx tsc --noEmit`, `npx eslint . --max-warnings 0` all green. |
| **M2: Scenarios list (3.1)**                          | Sales user sees only their own scenarios; admin sees all; "New scenario" creates a DRAFT and redirects to the builder at `/scenarios/[id]/notes`.                                                                                                                |
| **M3: Notes tab working (3.2)**                       | Builder shell renders with header, tab nav, and static rail; Notes tab saves seat count + persona mix (100% sum enforced server-side and in UI); layout enforces that a sales user cannot view another user's scenario.                                          |
| **M4: All three tabs (3.3)**                          | Training/White-glove SKU picker adds lines; custom line item form works; Service department picker adds lines; cost columns are absent for sales role.                                                                                                           |
| **M5: Live recalc + bundle apply (3.4)**              | Sticky rail updates within 300ms of any input change; in-flight requests are aborted on rapid changes; bundle apply materialises configs and sets `appliedBundleId`; unapply clears the bundle link without deleting lines.                                      |
| **M6: Phase complete (3.5)**                          | Generate Quote stub is wired; archive action works from the list; sales-role copy is neutral throughout all components; Playwright smoke test passes end-to-end.                                                                                                 |
| **M7: Integration tests green (parallel workstream)** | All 67 previously-skipped repo tests pass in CI against real Postgres. This milestone may land concurrently with M6 and is required before phase-level acceptance is declared.                                                                                   |

---

## Acceptance Criteria

### Functional

- [ ] A sales user can create a scenario, navigate all three tabs, add SKU-based and custom labor lines to Training/White-glove, add department-hours lines to Service, and set seat count + persona mix on Notes.
- [ ] Persona mix sliders enforce 100% sum: saving a mix that does not sum to 100 returns a `ValidationError`; the UI shows the total in red while the mix is off.
- [ ] A sales user cannot see cost columns (`Cost/unit`, `Cost total`) in any labor line table.
- [ ] A sales user navigating to `/scenarios/[other-user-id]` receives a 404 — the layout enforces ownership before rendering.
- [ ] An admin user sees all scenarios on the list page and can filter by customer name; the owner filter control is visible only to admins.
- [ ] The sticky rail displays contract revenue, contribution margin, commissions, and net margin ($); it updates within 300ms of any input change via a debounced `POST /api/compute`.
- [ ] Rail warnings display for soft and hard violations; for sales role the copy is neutral — no raw measured values, no threshold numbers, no commission rule names.
- [ ] Bundle apply: selecting a bundle writes all bundle SaaS configs and labor lines into the scenario and sets `Scenario.appliedBundleId`.
- [ ] Unapplying a bundle clears `appliedBundleId` without deleting materialised lines.
- [ ] Archive from the list page sets `isArchived = true` and `status = 'ARCHIVED'`; archived scenarios do not appear in the default list.
- [ ] "Generate Quote" button posts to the stub endpoint and transitions to a "Generating..." disabled state — no crash, no unhandled rejection.

### Non-functional

- [ ] `npx tsc --noEmit` passes with zero errors across the entire project.
- [ ] `npx eslint . --max-warnings 0` passes.
- [ ] `npx vitest run` passes — all unit + service mock tests green.
- [ ] Integration tests (the 67 previously-skipped repo tests) pass in CI against real Postgres (parallel workstream gate — required for phase-level acceptance).
- [ ] The test-login endpoint (`/api/auth/test-login`) returns 404 when `NODE_ENV === 'production'` — verified by a CI step.
- [ ] `POST /api/compute` returns 401 for unauthenticated requests.
- [ ] No Prisma imports in `lib/engine/`. The engine remains pure.
- [ ] Money values are never stored or computed as JavaScript `number` in the service or engine layers. Prisma `Decimal` fields flow into `decimal.js` `Decimal`; `toCents()` is the only conversion point to `number`.
- [ ] Live compute uses `AbortController` to cancel in-flight requests before issuing new ones.

---

## Phase 3 → Phase 4 Handoff

At the end of Phase 3:

- Sales users can run the full workup flow — Notes, Training/White-glove, Service, bundle apply, live margin rail.
- `ScenarioRepository`, `ScenarioSaaSConfigRepository`, and `ScenarioLaborLineRepository` are production-ready and tested. Phase 4 uses them directly for the quote write path.
- `POST /api/compute` is the stable engine integration point. Phase 4 reuses it for the pre-generate-quote compute step (re-run engine with current rates before freezing totals in the `Quote` row).
- The `Quote` Prisma model and its FK to `Scenario` are already migrated (Phase 1 schema). Phase 4 only needs to implement the write path, PDF rendering via `react-pdf`, object storage upload, and the `Quote` row creation.
- The "Generate Quote" button stub in `ScenarioHeader` is replaced in Phase 4 with the real action: re-run compute → render PDF → upload to object storage → create `Quote` row with sequential version + frozen `totals` snapshot → redirect to `/scenarios/[id]/quotes`.
- No rework of Phase 3 pages is expected in Phase 4 except wiring the real quote action into the existing button slot.
