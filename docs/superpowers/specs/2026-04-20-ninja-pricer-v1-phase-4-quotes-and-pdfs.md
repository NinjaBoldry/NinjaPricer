# Ninja Pricer v1 — Phase 4: Quotes & PDFs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sales can generate customer-facing quote PDFs from a scenario; admins can additionally download an internal-summary PDF with costs, margin, and commissions; each generation persists an immutable `Quote` row with frozen totals and a sequential version.

**Architecture:** A `QuoteService` re-runs the engine via the same `/api/compute` data-assembly path, renders both PDF variants with `@react-pdf/renderer`, writes the files to disk-backed storage (Railway volume), and persists a `Quote` row with `customerSnapshot` + `totals` frozen as JSON. Downloads go through an auth-gated route that streams the file after a session + ownership check. No third-party signing, no S3 client — storage is a single module we can swap later behind its function signatures.

**Tech Stack:** TypeScript (strict), Next.js 14 app router, Prisma, Postgres, NextAuth v5, Zod, `@react-pdf/renderer`, Node `fs`, decimal.js, Vitest.

**Spec reference:** [docs/superpowers/specs/2026-04-17-ninja-pricer-v1-design.md](./2026-04-17-ninja-pricer-v1-design.md)

**Phase roadmap:** [docs/superpowers/plans/2026-04-17-ninja-pricer-v1-phases.md](../plans/2026-04-17-ninja-pricer-v1-phases.md)

**Phase 3 plan:** [docs/superpowers/specs/2026-04-19-ninja-pricer-v1-phase-3-sales-ui.md](./2026-04-19-ninja-pricer-v1-phase-3-sales-ui.md)

---

## Conventions (inherited from Phases 1–3, restated for agentic workers)

- **TDD.** Write failing test → run → implement → run passing → commit.
- **One task = one commit** unless the task explicitly groups multiple commits.
- **Money in the engine:** computations go through `decimal.js`. Final totals in integer cents. The engine is not modified in this phase.
- **Pure engine:** no changes to `lib/engine/*` in Phase 4.
- **Server Actions or Route Handlers for mutations.** Quote generation is a POST to `/api/quotes/generate` (already stubbed). Admin-only endpoints check `user.role === 'ADMIN'`.
- **Zod at the service boundary.** QuoteService validates input with Zod before DB writes.
- **Typed errors.** `ValidationError`, `NotFoundError` thrown by services and mapped at the route boundary.
- **Repository pattern.** `QuoteRepository` wraps Prisma; `QuoteService` orchestrates repos + engine + storage + PDF renderers.
- **Commit-message style:** conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `refactor:`, `docs:`).

---

## Goals

- Sales can click **Generate Quote** on a scenario and receive a downloadable, customer-facing PDF within a few seconds.
- Admin users see an additional **Download internal summary** button per quote version that exposes costs, margins, and commissions.
- Each generation creates a new `Quote` row with a sequential `version` per scenario, a frozen `totals` JSON snapshot, and a frozen `customerSnapshot` JSON.
- A `/scenarios/[id]/quotes` page lists versions with metadata and download links.
- Download links work only for authenticated users who own the scenario (sales) or any admin; unauthorized requests return 404 (not 403) to avoid leaking existence.

## Non-Goals

- MCP server, HubSpot, Cowork integration — v2.
- S3-compatible storage — kept behind function signatures but not implemented here; Railway volume is sufficient for v1.
- Historical rate-card versioning — the frozen `totals` + archived PDF are the audit trail.
- Editing or regenerating existing `Quote` rows (quotes are append-only; a new version is always a new row).
- Email delivery of quotes — sales downloads and attaches manually.
- Branded PDF design system — v1 uses a clean default layout. Visual polish/theming is v2.

---

## Sub-phase Overview

| Sub-phase | Theme | Key output |
|-----------|-------|------------|
| 4.0 | Intake — deps, env, storage bootstrap | `@react-pdf/renderer` installed; `QUOTE_STORAGE_DIR` env var; storage module skeleton |
| 4.1 | QuoteRepository | Thin Prisma wrapper with `nextVersion` + `create` + `listByScenario` |
| 4.2 | Rate-snapshot extraction | `lib/services/rateSnapshot.ts` factored out of `/api/compute` so QuoteService can reuse |
| 4.3 | QuoteService (no PDF yet) | Re-runs engine, builds snapshots, writes a `Quote` row, returns metadata |
| 4.4 | PDF renderers | Two pure functions returning `Buffer`: customer PDF, internal PDF |
| 4.5 | `/api/quotes/generate` real implementation | Wires service + PDF + storage; replaces stub |
| 4.6 | Quote history page + download route | `/scenarios/[id]/quotes` UI + `/api/quotes/[quoteId]/download` |
| 4.7 | Header button wiring + Playwright smoke | `ScenarioHeaderButtons` posts and opens PDF; smoke test covers end-to-end |

**Sequencing rationale:**

4.0 lands dependencies and env so subsequent tasks can import. 4.1 and 4.2 are pure plumbing that 4.3 composes. 4.3 builds the service without PDF so we can TDD the DB-write + versioning + snapshot logic in isolation; 4.4 builds the renderers against fixture `ComputeResult` objects; 4.5 composes the whole thing. 4.6 ships the read surface (history + download). 4.7 wires the existing stub button and adds the smoke test as the final proof.

`@react-pdf/renderer` is installed in 4.0 (not later) because the bundle-size decision is binding and we want CI to exercise it from the first commit that uses it.

---

## Phase 4.0 — Intake: dependencies, env, storage bootstrap

**Goal:** Pull in the PDF library, wire up the storage directory env, add a tiny storage module used by later sub-phases, and verify CI still passes.

**Files touched:**
- Modify: `package.json` (add `@react-pdf/renderer`)
- Modify: `.env.example` (add `QUOTE_STORAGE_DIR`)
- Modify: `README.md` (one-line note on quote storage dir)
- Create: `lib/utils/quoteStorage.ts`
- Create: `lib/utils/quoteStorage.test.ts`

### Task 4.0-A: Add `@react-pdf/renderer` dependency

- [ ] **Step 1: Install dependency**

Run: `npm install @react-pdf/renderer@^3.4.0`

Expected: `package.json` and `package-lock.json` updated; no audit errors.

- [ ] **Step 2: Verify typecheck still passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add @react-pdf/renderer for quote PDFs"
```

### Task 4.0-B: Add `QUOTE_STORAGE_DIR` env + `.env.example` entry

- [ ] **Step 1: Add env line to `.env.example`**

Append to `.env.example`:

```
# Absolute path on the server where generated quote PDFs are written.
# Local dev default: ./.quote-storage
# Railway: mount a persistent volume and point here (e.g. /data/quotes)
QUOTE_STORAGE_DIR="./.quote-storage"
```

- [ ] **Step 2: Add `.quote-storage/` to `.gitignore`**

Append to `.gitignore`:

```
.quote-storage/
```

- [ ] **Step 3: Document in `README.md`**

Add one line under any "Environment" or "Local setup" section referencing `QUOTE_STORAGE_DIR`. If no such section exists, append under `## Environment variables` at the end of the file.

- [ ] **Step 4: Commit**

```bash
git add .env.example .gitignore README.md
git commit -m "chore(env): QUOTE_STORAGE_DIR for quote PDF output"
```

### Task 4.0-C: Write `quoteStorage.ts` with failing test first

**File responsibility:** Thin wrapper around `fs` that (1) resolves the per-scenario subdirectory, (2) writes a Buffer to a canonical path, (3) reads it back as a stream. All other callers use these helpers; no other file imports `fs/promises` or `path` for quote I/O.

- [ ] **Step 1: Write the failing test**

Create `lib/utils/quoteStorage.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeQuotePdf, quotePdfPath } from './quoteStorage';

describe('quoteStorage', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'quote-storage-'));
    process.env.QUOTE_STORAGE_DIR = tmp;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('writes a pdf to scenarioId/quoteId-customer.pdf', async () => {
    const buf = Buffer.from('%PDF-1.4 test', 'utf8');
    const dest = await writeQuotePdf({
      scenarioId: 'scen_123',
      quoteId: 'quote_abc',
      kind: 'customer',
      buffer: buf,
    });

    const expected = path.join(tmp, 'scen_123', 'quote_abc-customer.pdf');
    expect(dest).toBe(expected);
    expect(existsSync(expected)).toBe(true);
    expect(readFileSync(expected)).toEqual(buf);
  });

  it('quotePdfPath resolves without writing', () => {
    const p = quotePdfPath({ scenarioId: 's', quoteId: 'q', kind: 'internal' });
    expect(p).toBe(path.join(tmp, 's', 'q-internal.pdf'));
  });

  it('throws if QUOTE_STORAGE_DIR is unset', async () => {
    delete process.env.QUOTE_STORAGE_DIR;
    await expect(
      writeQuotePdf({ scenarioId: 's', quoteId: 'q', kind: 'customer', buffer: Buffer.from('') }),
    ).rejects.toThrow(/QUOTE_STORAGE_DIR/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/utils/quoteStorage.test.ts`
Expected: FAIL with `Cannot find module './quoteStorage'`.

- [ ] **Step 3: Implement `quoteStorage.ts`**

Create `lib/utils/quoteStorage.ts`:

```typescript
import { mkdir, writeFile } from 'node:fs/promises';
import { createReadStream, type ReadStream } from 'node:fs';
import path from 'node:path';

export type QuoteKind = 'customer' | 'internal';

interface StorageArgs {
  scenarioId: string;
  quoteId: string;
  kind: QuoteKind;
}

function baseDir(): string {
  const dir = process.env.QUOTE_STORAGE_DIR;
  if (!dir) {
    throw new Error('QUOTE_STORAGE_DIR is not configured');
  }
  return dir;
}

export function quotePdfPath({ scenarioId, quoteId, kind }: StorageArgs): string {
  return path.join(baseDir(), scenarioId, `${quoteId}-${kind}.pdf`);
}

export async function writeQuotePdf(
  args: StorageArgs & { buffer: Buffer },
): Promise<string> {
  const dest = quotePdfPath(args);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, args.buffer);
  return dest;
}

export function readQuotePdfStream(args: StorageArgs): ReadStream {
  return createReadStream(quotePdfPath(args));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/utils/quoteStorage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/quoteStorage.ts lib/utils/quoteStorage.test.ts
git commit -m "feat(quotes): quoteStorage helpers for read/write of PDFs"
```

### Phase 4.0 completion check

- [ ] `npm run test` passes
- [ ] `npm run lint` passes
- [ ] `npx tsc --noEmit` passes

---

## Phase 4.1 — QuoteRepository

**Goal:** Thin Prisma wrapper with exactly the three methods the service needs. Handles sequential versioning with a unique-constraint retry.

**Files touched:**
- Create: `lib/db/repositories/quote.ts`
- Create: `lib/db/repositories/quote.test.ts`
- Modify: `lib/db/repositories/index.ts`

### Task 4.1-A: `QuoteRepository` with `nextVersion`, `create`, `listByScenario`

- [ ] **Step 1: Write the failing test**

Create `lib/db/repositories/quote.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuoteRepository } from './quote';

vi.mock('@/lib/db/client', () => {
  const quote = {
    aggregate: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  };
  return { prisma: { quote } };
});

import { prisma } from '@/lib/db/client';

describe('QuoteRepository', () => {
  let repo: QuoteRepository;
  beforeEach(() => {
    vi.clearAllMocks();
    repo = new QuoteRepository();
  });

  it('nextVersion returns max+1 for a scenario', async () => {
    (prisma.quote.aggregate as any).mockResolvedValue({ _max: { version: 3 } });
    const v = await repo.nextVersion('scen_1');
    expect(v).toBe(4);
    expect(prisma.quote.aggregate).toHaveBeenCalledWith({
      where: { scenarioId: 'scen_1' },
      _max: { version: true },
    });
  });

  it('nextVersion returns 1 when no prior quotes', async () => {
    (prisma.quote.aggregate as any).mockResolvedValue({ _max: { version: null } });
    expect(await repo.nextVersion('scen_1')).toBe(1);
  });

  it('create forwards its data to prisma.quote.create', async () => {
    (prisma.quote.create as any).mockResolvedValue({ id: 'q1' });
    await repo.create({
      scenarioId: 'scen_1',
      version: 1,
      pdfUrl: 'scen_1/q1-customer.pdf',
      internalPdfUrl: 'scen_1/q1-internal.pdf',
      generatedById: 'u1',
      customerSnapshot: { name: 'Acme' },
      totals: { contractRevenueCents: 100 },
    });
    expect(prisma.quote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenarioId: 'scen_1',
        version: 1,
        pdfUrl: 'scen_1/q1-customer.pdf',
        internalPdfUrl: 'scen_1/q1-internal.pdf',
      }),
    });
  });

  it('listByScenario orders by version desc', async () => {
    (prisma.quote.findMany as any).mockResolvedValue([]);
    await repo.listByScenario('scen_1');
    expect(prisma.quote.findMany).toHaveBeenCalledWith({
      where: { scenarioId: 'scen_1' },
      orderBy: { version: 'desc' },
      include: { generatedBy: { select: { id: true, email: true, name: true } } },
    });
  });

  it('findById returns a row', async () => {
    (prisma.quote.findUnique as any).mockResolvedValue({ id: 'q1' });
    const q = await repo.findById('q1');
    expect(q).toEqual({ id: 'q1' });
    expect(prisma.quote.findUnique).toHaveBeenCalledWith({
      where: { id: 'q1' },
      include: { scenario: { select: { id: true, ownerId: true } } },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/db/repositories/quote.test.ts`
Expected: FAIL with `Cannot find module './quote'`.

- [ ] **Step 3: Implement `quote.ts`**

Create `lib/db/repositories/quote.ts`:

```typescript
import { prisma } from '@/lib/db/client';
import type { Prisma } from '@prisma/client';

export interface CreateQuoteInput {
  scenarioId: string;
  version: number;
  pdfUrl: string;
  internalPdfUrl: string | null;
  generatedById: string;
  customerSnapshot: Prisma.InputJsonValue;
  totals: Prisma.InputJsonValue;
}

export class QuoteRepository {
  async nextVersion(scenarioId: string): Promise<number> {
    const agg = await prisma.quote.aggregate({
      where: { scenarioId },
      _max: { version: true },
    });
    return (agg._max.version ?? 0) + 1;
  }

  async create(data: CreateQuoteInput) {
    return prisma.quote.create({ data });
  }

  async listByScenario(scenarioId: string) {
    return prisma.quote.findMany({
      where: { scenarioId },
      orderBy: { version: 'desc' },
      include: { generatedBy: { select: { id: true, email: true, name: true } } },
    });
  }

  async findById(id: string) {
    return prisma.quote.findUnique({
      where: { id },
      include: { scenario: { select: { id: true, ownerId: true } } },
    });
  }
}
```

- [ ] **Step 4: Export from repositories index**

Edit `lib/db/repositories/index.ts` and add:

```typescript
export { QuoteRepository } from './quote';
```

(If the file already has grouped exports, slot this with the other repos alphabetically.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/db/repositories/quote.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/db/repositories/quote.ts lib/db/repositories/quote.test.ts lib/db/repositories/index.ts
git commit -m "feat(quotes): QuoteRepository with nextVersion/create/list/findById"
```

---

## Phase 4.2 — Rate-snapshot extraction

**Goal:** Lift the DB-to-`ComputeRequest` assembly out of `app/api/compute/route.ts` into `lib/services/rateSnapshot.ts` so QuoteService can reuse it without HTTP coupling. No behavioral change to `/api/compute`.

**Files touched:**
- Create: `lib/services/rateSnapshot.ts`
- Create: `lib/services/rateSnapshot.test.ts`
- Modify: `app/api/compute/route.ts` (delegate)

### Task 4.2-A: Extract `buildComputeRequest(scenarioId)`

- [ ] **Step 1: Write the failing integration test**

Create `lib/services/rateSnapshot.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildComputeRequest } from './rateSnapshot';
import { NotFoundError } from '@/lib/utils/errors';

describe('buildComputeRequest', () => {
  it('throws NotFoundError for unknown scenario', async () => {
    await expect(buildComputeRequest('does-not-exist')).rejects.toThrow(NotFoundError);
  });
});
```

> Note: the deep DB assembly is already exercised by existing `/api/compute/route.test.ts` (which will keep passing post-refactor). This file only locks in the not-found behavior.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/services/rateSnapshot.test.ts`
Expected: FAIL with `Cannot find module './rateSnapshot'`.

- [ ] **Step 3: Create `rateSnapshot.ts`**

Move the body of the current `app/api/compute/route.ts` POST handler (everything from the `prisma.scenario.findUnique` call through the construction of `req: ComputeRequest`) into a new pure-ish function. The function takes a `scenarioId`, throws `NotFoundError` if missing, and returns `{ scenario, request }` where `request` is a `ComputeRequest` and `scenario` is the raw Prisma scenario (so the route can still check ownership and build response metadata).

Create `lib/services/rateSnapshot.ts`:

```typescript
import { prisma } from '@/lib/db/client';
import Decimal from 'decimal.js';
import { NotFoundError } from '@/lib/utils/errors';
import { computeLoadedHourlyRate } from '@/lib/services/labor';
import { d } from '@/lib/utils/money';
import type {
  ComputeRequest,
  SaaSProductSnap,
  LaborSKUSnap,
  DepartmentSnap,
  TabInput,
} from '@/lib/engine/types';

export type ScenarioWithConfigs = NonNullable<
  Awaited<ReturnType<typeof fetchScenarioWithConfigs>>
>;

async function fetchScenarioWithConfigs(scenarioId: string) {
  return prisma.scenario.findUnique({
    where: { id: scenarioId },
    include: {
      saasConfigs: true,
      laborLines: { orderBy: { sortOrder: 'asc' } },
      owner: { select: { id: true, email: true, name: true } },
    },
  });
}

export async function buildComputeRequest(scenarioId: string): Promise<{
  scenario: ScenarioWithConfigs;
  request: ComputeRequest;
}> {
  const scenario = await fetchScenarioWithConfigs(scenarioId);
  if (!scenario) throw new NotFoundError(`Scenario ${scenarioId} not found`);

  const saasProductIds = scenario.saasConfigs.map((c) => c.productId);
  const laborProductIds = Array.from(new Set(scenario.laborLines.map((l) => l.productId)));
  const skuIds = scenario.laborLines.map((l) => l.skuId).filter((id): id is string => id !== null);
  const deptIds = scenario.laborLines
    .map((l) => l.departmentId)
    .filter((id): id is string => id !== null);

  const [saasProducts, laborProducts, skus, departments, allBurdens, commissionRules] =
    await Promise.all([
      prisma.product.findMany({
        where: { id: { in: saasProductIds } },
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
          rails: { where: { isEnabled: true } },
        },
      }),
      prisma.product.findMany({
        where: { id: { in: laborProductIds } },
        include: { rails: { where: { isEnabled: true } } },
      }),
      skuIds.length > 0
        ? prisma.laborSKU.findMany({ where: { id: { in: skuIds } } })
        : Promise.resolve([]),
      deptIds.length > 0
        ? prisma.department.findMany({
            where: { id: { in: deptIds } },
            include: { billRate: true, employees: { where: { isActive: true } } },
          })
        : Promise.resolve([]),
      deptIds.length > 0
        ? prisma.burden.findMany({ where: { isActive: true } })
        : Promise.resolve([]),
      prisma.commissionRule.findMany({
        where: { isActive: true },
        include: { tiers: { orderBy: { sortOrder: 'asc' } } },
      }),
    ]);

  const saasSnaps: Record<string, SaaSProductSnap> = {};
  for (const p of saasProducts) {
    saasSnaps[p.id] = {
      kind: 'SAAS_USAGE',
      productId: p.id,
      vendorRates: p.vendorRates.map((vr) => ({
        id: vr.id,
        name: vr.name,
        unitLabel: vr.unitLabel,
        rateUsd: d(vr.rateUsd),
      })),
      baseUsage: p.baseUsage.map((bu) => ({
        vendorRateId: bu.vendorRateId,
        usagePerMonth: d(bu.usagePerMonth),
      })),
      otherVariableUsdPerUserPerMonth: d(p.otherVariable?.usdPerUserPerMonth ?? 0),
      personas: p.personas.map((pe) => ({
        id: pe.id,
        name: pe.name,
        multiplier: d(pe.multiplier),
      })),
      fixedCosts: p.fixedCosts.map((fc) => ({
        id: fc.id,
        name: fc.name,
        monthlyUsd: d(fc.monthlyUsd),
      })),
      activeUsersAtScale: p.scale?.activeUsersAtScale ?? 0,
      listPriceUsdPerSeatPerMonth: d(p.listPrice?.usdPerSeatPerMonth ?? 0),
      volumeTiers: p.volumeTiers.map((vt) => ({
        minSeats: vt.minSeats,
        discountPct: d(vt.discountPct),
      })),
      contractModifiers: p.contractModifiers.map((cm) => ({
        minMonths: cm.minMonths,
        additionalDiscountPct: d(cm.additionalDiscountPct),
      })),
    };
  }

  const skuSnaps: Record<string, LaborSKUSnap> = {};
  for (const sku of skus) {
    skuSnaps[sku.id] = {
      id: sku.id,
      productId: sku.productId,
      name: sku.name,
      unit: sku.unit,
      costPerUnitUsd: d(sku.costPerUnitUsd),
      defaultRevenuePerUnitUsd: d(sku.defaultRevenueUsd),
    };
  }

  const deptSnaps: Record<string, DepartmentSnap> = {};
  for (const dept of departments) {
    const applicableBurdens = allBurdens.filter(
      (b) =>
        b.scope === 'ALL_DEPARTMENTS' || (b.scope === 'DEPARTMENT' && b.departmentId === dept.id),
    );
    const burdenInputs = applicableBurdens.map((b) => ({
      ratePct: d(b.ratePct),
      capUsd: b.capUsd != null ? d(b.capUsd) : undefined,
    }));

    let totalLoadedRate = new Decimal(0);
    let empCount = 0;
    for (const emp of dept.employees) {
      if (
        emp.compensationType === 'ANNUAL_SALARY' &&
        emp.annualSalaryUsd &&
        emp.standardHoursPerYear
      ) {
        totalLoadedRate = totalLoadedRate.plus(
          computeLoadedHourlyRate({
            compensationType: 'ANNUAL_SALARY',
            annualSalaryUsd: d(emp.annualSalaryUsd),
            standardHoursPerYear: emp.standardHoursPerYear,
            burdens: burdenInputs,
          }),
        );
        empCount++;
      } else if (
        emp.compensationType === 'HOURLY' &&
        emp.hourlyRateUsd &&
        emp.standardHoursPerYear
      ) {
        totalLoadedRate = totalLoadedRate.plus(
          computeLoadedHourlyRate({
            compensationType: 'HOURLY',
            hourlyRateUsd: d(emp.hourlyRateUsd),
            standardHoursPerYear: emp.standardHoursPerYear,
            burdens: burdenInputs,
          }),
        );
        empCount++;
      }
    }

    deptSnaps[dept.id] = {
      id: dept.id,
      name: dept.name,
      loadedRatePerHourUsd: empCount > 0 ? totalLoadedRate.div(empCount) : new Decimal(0),
      billRatePerHourUsd: d(dept.billRate?.billRatePerHour ?? 0),
    };
  }

  const tabs: TabInput[] = [];
  for (const cfg of scenario.saasConfigs) {
    tabs.push({
      kind: 'SAAS_USAGE',
      productId: cfg.productId,
      seatCount: cfg.seatCount,
      personaMix: cfg.personaMix as { personaId: string; pct: number }[],
      ...(cfg.discountOverridePct != null && { discountOverridePct: d(cfg.discountOverridePct) }),
    });
  }

  type LaborLine = (typeof scenario.laborLines)[number];
  const laborProductKind = new Map(laborProducts.map((p) => [p.id, p.kind]));
  const linesByProduct = new Map<string, LaborLine[]>();
  for (const line of scenario.laborLines) {
    const arr = linesByProduct.get(line.productId) ?? [];
    arr.push(line);
    linesByProduct.set(line.productId, arr);
  }
  for (const [productId, lines] of Array.from(linesByProduct.entries())) {
    const kind = laborProductKind.get(productId);
    if (kind === 'PACKAGED_LABOR') {
      tabs.push({
        kind: 'PACKAGED_LABOR',
        productId,
        lineItems: lines.map((l: LaborLine) => ({
          ...(l.skuId != null && { skuId: l.skuId }),
          ...(l.customDescription != null && { customDescription: l.customDescription }),
          qty: d(l.qty),
          unit: l.unit,
          costPerUnitUsd: d(l.costPerUnitUsd),
          revenuePerUnitUsd: d(l.revenuePerUnitUsd),
        })),
      });
    } else if (kind === 'CUSTOM_LABOR') {
      tabs.push({
        kind: 'CUSTOM_LABOR',
        productId,
        lineItems: lines.map((l: LaborLine) => ({
          ...(l.departmentId != null && { departmentId: l.departmentId }),
          ...(l.customDescription != null && { customDescription: l.customDescription }),
          hours: d(l.qty),
        })),
      });
    }
  }

  const railsById = new Map(
    [...saasProducts.flatMap((p) => p.rails), ...laborProducts.flatMap((p) => p.rails)].map((r) => [
      r.id,
      r,
    ]),
  );
  const rails = Array.from(railsById.values()).map((r) => ({
    id: r.id,
    productId: r.productId,
    kind: r.kind,
    marginBasis: r.marginBasis,
    softThreshold: d(r.softThreshold),
    hardThreshold: d(r.hardThreshold),
  }));

  const request: ComputeRequest = {
    contractMonths: scenario.contractMonths,
    tabs,
    products: { saas: saasSnaps, laborSKUs: skuSnaps, departments: deptSnaps },
    commissionRules: commissionRules
      .filter((r) => r.tiers.length > 0)
      .map((r) => ({
        id: r.id,
        name: r.name,
        scopeType: r.scopeType,
        ...(r.scopeProductId != null && { scopeProductId: r.scopeProductId }),
        ...(r.scopeDepartmentId != null && { scopeDepartmentId: r.scopeDepartmentId }),
        baseMetric: r.baseMetric,
        tiers: r.tiers.map((t) => ({
          thresholdFromUsd: d(t.thresholdFromUsd),
          ratePct: d(t.ratePct),
        })),
        ...(r.recipientEmployeeId != null && { recipientEmployeeId: r.recipientEmployeeId }),
      })),
    rails,
  };

  return { scenario, request };
}
```

- [ ] **Step 4: Refactor `app/api/compute/route.ts` to use it**

Replace the body of `app/api/compute/route.ts` with:

```typescript
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { compute } from '@/lib/engine';
import { buildComputeRequest } from '@/lib/services/rateSnapshot';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let scenarioId: string;
  try {
    const body = (await request.json()) as { scenarioId?: unknown };
    if (typeof body.scenarioId !== 'string' || !body.scenarioId) {
      return NextResponse.json({ error: 'scenarioId is required' }, { status: 400 });
    }
    scenarioId = body.scenarioId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const { scenario, request: computeReq } = await buildComputeRequest(scenarioId);
    if (user.role === 'SALES' && scenario.ownerId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const result = compute(computeReq);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NotFoundError) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: 422 });
    }
    throw e;
  }
}
```

- [ ] **Step 5: Run all tests**

Run: `npm run test`
Expected: PASS, including the pre-existing `app/api/compute/route.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/services/rateSnapshot.ts lib/services/rateSnapshot.test.ts app/api/compute/route.ts
git commit -m "refactor(compute): extract rate-snapshot builder for reuse by QuoteService"
```

---

## Phase 4.3 — QuoteService (no PDF yet)

**Goal:** Define the service API that will be composed by the route. TDD: write the service first, mocking storage and PDF renderers behind simple function signatures, so the versioning + snapshot logic is provably correct.

**Files touched:**
- Create: `lib/services/quote.ts`
- Create: `lib/services/quote.test.ts`
- Modify: `lib/services/index.ts`

### Task 4.3-A: `generateQuote` composes engine + repo + (stubbed) PDF + storage

- [ ] **Step 1: Write the failing test**

Create `lib/services/quote.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';

vi.mock('@/lib/services/rateSnapshot', () => ({
  buildComputeRequest: vi.fn(),
}));
vi.mock('@/lib/engine', () => ({
  compute: vi.fn(),
}));
vi.mock('@/lib/db/repositories/quote', () => ({
  QuoteRepository: vi.fn().mockImplementation(() => ({
    nextVersion: vi.fn(),
    create: vi.fn(),
  })),
}));
vi.mock('@/lib/utils/quoteStorage', () => ({
  writeQuotePdf: vi.fn(async () => '/tmp/fake.pdf'),
}));

import { buildComputeRequest } from '@/lib/services/rateSnapshot';
import { compute } from '@/lib/engine';
import { QuoteRepository } from '@/lib/db/repositories/quote';
import { writeQuotePdf } from '@/lib/utils/quoteStorage';
import { generateQuote } from './quote';

const mockScenario = {
  id: 'scen_1',
  name: 'Acme pilot',
  customerName: 'Acme',
  contractMonths: 12,
  ownerId: 'u1',
  saasConfigs: [],
  laborLines: [],
  owner: { id: 'u1', email: 'o@x.com', name: 'Owner' },
} as any;

const mockResult = {
  perTab: [],
  totals: {
    monthlyCostCents: 0,
    monthlyRevenueCents: 0,
    contractCostCents: 1000,
    contractRevenueCents: 10000,
    contributionMarginCents: 9000,
    netMarginCents: 8000,
    marginPctContribution: 0.9,
    marginPctNet: 0.8,
  },
  commissions: [],
  warnings: [],
};

describe('generateQuote', () => {
  let nextVersion: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    nextVersion = vi.fn();
    create = vi.fn();
    (QuoteRepository as any).mockImplementation(() => ({ nextVersion, create }));
    (buildComputeRequest as any).mockResolvedValue({
      scenario: mockScenario,
      request: { contractMonths: 12 },
    });
    (compute as any).mockReturnValue(mockResult);
  });

  it('renders PDFs, writes them, and persists a quote row', async () => {
    nextVersion.mockResolvedValue(3);
    create.mockResolvedValue({ id: 'q_abc', version: 3, pdfUrl: 'scen_1/q_abc-customer.pdf' });
    const pdf = { customer: vi.fn(async () => Buffer.from('C')), internal: vi.fn(async () => Buffer.from('I')) };

    const out = await generateQuote(
      { scenarioId: 'scen_1', generatedById: 'u1' },
      { renderPdf: pdf },
    );

    expect(nextVersion).toHaveBeenCalledWith('scen_1');
    expect(pdf.customer).toHaveBeenCalledTimes(1);
    expect(pdf.internal).toHaveBeenCalledTimes(1);
    expect(writeQuotePdf).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarioId: 'scen_1',
        version: 3,
        generatedById: 'u1',
        pdfUrl: expect.stringMatching(/customer\.pdf$/),
        internalPdfUrl: expect.stringMatching(/internal\.pdf$/),
        customerSnapshot: expect.objectContaining({ customerName: 'Acme' }),
        totals: expect.objectContaining({ contractRevenueCents: 10000 }),
      }),
    );
    expect(out.id).toBe('q_abc');
    expect(out.version).toBe(3);
  });

  it('retries on P2002 unique constraint by bumping version', async () => {
    nextVersion.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const uniqueErr = Object.assign(new Error('unique'), {
      code: 'P2002',
    });
    create.mockRejectedValueOnce(uniqueErr).mockResolvedValueOnce({ id: 'q2', version: 2 });
    const pdf = { customer: vi.fn(async () => Buffer.from('C')), internal: vi.fn(async () => Buffer.from('I')) };

    const out = await generateQuote(
      { scenarioId: 'scen_1', generatedById: 'u1' },
      { renderPdf: pdf },
    );

    expect(nextVersion).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(out.version).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/services/quote.test.ts`
Expected: FAIL with `Cannot find module './quote'`.

- [ ] **Step 3: Implement `quote.ts`**

Create `lib/services/quote.ts`:

```typescript
import { compute } from '@/lib/engine';
import { QuoteRepository } from '@/lib/db/repositories/quote';
import { buildComputeRequest } from '@/lib/services/rateSnapshot';
import { writeQuotePdf } from '@/lib/utils/quoteStorage';
import type { ComputeResult } from '@/lib/engine/types';

export interface QuotePdfRenderer {
  customer(args: RenderArgs): Promise<Buffer>;
  internal(args: RenderArgs): Promise<Buffer>;
}

export interface RenderArgs {
  scenario: {
    id: string;
    name: string;
    customerName: string;
    contractMonths: number;
  };
  generatedAt: Date;
  version: number;
  result: ComputeResult;
}

interface GenerateArgs {
  scenarioId: string;
  generatedById: string;
}

interface Deps {
  renderPdf: QuotePdfRenderer;
  repo?: QuoteRepository;
  maxRetries?: number;
}

function isP2002(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'P2002'
  );
}

export async function generateQuote(args: GenerateArgs, deps: Deps) {
  const { scenarioId, generatedById } = args;
  const repo = deps.repo ?? new QuoteRepository();
  const maxRetries = deps.maxRetries ?? 3;

  const { scenario, request } = await buildComputeRequest(scenarioId);
  const result = compute(request);

  const customerSnapshot = {
    customerName: scenario.customerName,
    scenarioName: scenario.name,
    contractMonths: scenario.contractMonths,
    owner: scenario.owner,
    tabs: request.tabs,
  };
  const totals = { ...result.totals, commissions: result.commissions, warnings: result.warnings };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const version = await repo.nextVersion(scenarioId);
    const generatedAt = new Date();

    const renderArgs: RenderArgs = {
      scenario: {
        id: scenario.id,
        name: scenario.name,
        customerName: scenario.customerName,
        contractMonths: scenario.contractMonths,
      },
      generatedAt,
      version,
      result,
    };

    const [customerBuf, internalBuf] = await Promise.all([
      deps.renderPdf.customer(renderArgs),
      deps.renderPdf.internal(renderArgs),
    ]);

    // The repository will throw on duplicate (scenarioId, version). Pre-compute stable storage
    // keys that incorporate the version so a retry doesn't collide on disk either.
    const stubId = `v${version}-${Date.now()}`;

    const customerPath = await writeQuotePdf({
      scenarioId,
      quoteId: stubId,
      kind: 'customer',
      buffer: customerBuf,
    });
    const internalPath = await writeQuotePdf({
      scenarioId,
      quoteId: stubId,
      kind: 'internal',
      buffer: internalBuf,
    });

    try {
      const row = await repo.create({
        scenarioId,
        version,
        generatedById,
        pdfUrl: customerPath,
        internalPdfUrl: internalPath,
        customerSnapshot,
        totals,
      });
      return row;
    } catch (e) {
      if (isP2002(e) && attempt < maxRetries - 1) {
        continue;
      }
      throw e;
    }
  }

  throw new Error(`Could not acquire unique quote version for scenario ${scenarioId} after ${maxRetries} retries`);
}
```

- [ ] **Step 4: Export from services index**

Edit `lib/services/index.ts`, add:

```typescript
export { generateQuote } from './quote';
export type { QuotePdfRenderer, RenderArgs } from './quote';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/services/quote.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/services/quote.ts lib/services/quote.test.ts lib/services/index.ts
git commit -m "feat(quotes): QuoteService with versioning retry + frozen snapshot"
```

---

## Phase 4.4 — PDF renderers

**Goal:** Two pure functions that return `Buffer`: `renderCustomerPdf` and `renderInternalPdf`. Both take the same `RenderArgs` shape from `lib/services/quote.ts`. Layout is intentionally basic for v1 — matching the Design spec's "No costs or margins" / "cost breakdown, margin %, commissions" split.

**Files touched:**
- Create: `lib/pdf/customer.tsx`
- Create: `lib/pdf/internal.tsx`
- Create: `lib/pdf/shared.tsx`
- Create: `lib/pdf/format.ts`
- Create: `lib/pdf/renderer.ts`
- Create: `lib/pdf/customer.test.tsx`
- Create: `lib/pdf/internal.test.tsx`
- Create: `lib/pdf/format.test.ts`

### Task 4.4-A: Currency + date formatters

- [ ] **Step 1: Write the failing test**

Create `lib/pdf/format.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatCents, formatPct, formatDate } from './format';

describe('format', () => {
  it('formatCents formats integer cents as USD', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(-1000)).toBe('-$10.00');
  });

  it('formatPct handles fractions 0..1', () => {
    expect(formatPct(0)).toBe('0.0%');
    expect(formatPct(0.1234)).toBe('12.3%');
    expect(formatPct(1)).toBe('100.0%');
  });

  it('formatDate produces YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-04-20T12:34:56Z'))).toBe('2026-04-20');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/pdf/format.test.ts`
Expected: FAIL with `Cannot find module './format'`.

- [ ] **Step 3: Implement `format.ts`**

Create `lib/pdf/format.ts`:

```typescript
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${sign}$${dollars}.${frac}`;
}

export function formatPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/pdf/format.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/format.ts lib/pdf/format.test.ts
git commit -m "feat(pdf): currency/pct/date formatters"
```

### Task 4.4-B: Shared PDF layout primitives

- [ ] **Step 1: Implement shared components**

Create `lib/pdf/shared.tsx`:

```typescript
import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

export const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111827',
  },
  h1: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 14, fontWeight: 700, marginTop: 16, marginBottom: 6 },
  muted: { color: '#6b7280' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  table: { marginTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 4 },
  th: { fontWeight: 700 },
  col1: { flex: 3 },
  col2: { flex: 2, textAlign: 'right' },
  col3: { flex: 2, textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 8,
  },
});

export function Header({
  title,
  customerName,
  quoteVersion,
  generatedAt,
}: {
  title: string;
  customerName: string;
  quoteVersion: number;
  generatedAt: string;
}) {
  return (
    <View>
      <Text style={styles.h1}>{title}</Text>
      <View style={styles.row}>
        <Text>{customerName}</Text>
        <Text style={styles.muted}>
          Quote v{quoteVersion} · {generatedAt}
        </Text>
      </View>
    </View>
  );
}

export function Footer({ text }: { text: string }) {
  return <Text style={styles.footer}>{text}</Text>;
}
```

- [ ] **Step 2: Commit** (no test — this file is just layout primitives; coverage comes from the per-variant tests that follow)

```bash
git add lib/pdf/shared.tsx
git commit -m "feat(pdf): shared styles + Header/Footer"
```

### Task 4.4-C: Renderer wrapper (`renderer.ts`)

Owns the `@react-pdf/renderer` `renderToBuffer` call so tests can mock at a single seam.

- [ ] **Step 1: Implement**

Create `lib/pdf/renderer.ts`:

```typescript
import { renderToBuffer } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

export async function toBuffer(doc: ReactElement): Promise<Buffer> {
  return renderToBuffer(doc);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/pdf/renderer.ts
git commit -m "feat(pdf): renderer seam for @react-pdf/renderer"
```

### Task 4.4-D: Customer PDF

- [ ] **Step 1: Write the failing test**

Create `lib/pdf/customer.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import Decimal from 'decimal.js';
import type { RenderArgs } from '@/lib/services/quote';

vi.mock('./renderer', () => ({ toBuffer: vi.fn(async () => Buffer.from('PDF')) }));

import { toBuffer } from './renderer';
import { renderCustomerPdf } from './customer';

const args: RenderArgs = {
  scenario: { id: 's1', name: 'N', customerName: 'Acme', contractMonths: 12 },
  generatedAt: new Date('2026-04-20T00:00:00Z'),
  version: 2,
  result: {
    perTab: [
      {
        productId: 'p1',
        kind: 'SAAS_USAGE',
        monthlyCostCents: 100,
        monthlyRevenueCents: 1000,
        oneTimeCostCents: 0,
        oneTimeRevenueCents: 0,
        contractCostCents: 1200,
        contractRevenueCents: 12000,
        contributionMarginCents: 10800,
      },
    ],
    totals: {
      monthlyCostCents: 100,
      monthlyRevenueCents: 1000,
      contractCostCents: 1200,
      contractRevenueCents: 12000,
      contributionMarginCents: 10800,
      netMarginCents: 10800,
      marginPctContribution: 0.9,
      marginPctNet: 0.9,
    },
    commissions: [],
    warnings: [],
  },
};

describe('renderCustomerPdf', () => {
  it('returns a Buffer and does not render any cost/margin fields into the doc', async () => {
    const buf = await renderCustomerPdf(args);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect((toBuffer as any).mock.calls.length).toBe(1);

    // Shallow-inspect the React element passed to the renderer — walk the children
    // looking for any Text containing 'margin' or 'cost' (case-insensitive).
    const doc = (toBuffer as any).mock.calls[0][0];
    const serialized = JSON.stringify(doc, (_k, v) => (typeof v === 'function' ? undefined : v));
    expect(serialized.toLowerCase()).not.toContain('margin');
    expect(serialized.toLowerCase()).not.toContain('cost');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/pdf/customer.test.tsx`
Expected: FAIL with `Cannot find module './customer'`.

- [ ] **Step 3: Implement `customer.tsx`**

Create `lib/pdf/customer.tsx`:

```typescript
import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles, Header, Footer } from './shared';
import { formatCents, formatDate } from './format';
import { toBuffer } from './renderer';
import type { RenderArgs } from '@/lib/services/quote';

export async function renderCustomerPdf(args: RenderArgs): Promise<Buffer> {
  const { scenario, generatedAt, version, result } = args;
  return toBuffer(
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Header
          title={`Quote — ${scenario.name}`}
          customerName={scenario.customerName}
          quoteVersion={version}
          generatedAt={formatDate(generatedAt)}
        />

        <Text style={styles.h2}>Summary</Text>
        <View style={styles.row}>
          <Text>Contract length</Text>
          <Text>{scenario.contractMonths} months</Text>
        </View>
        <View style={styles.row}>
          <Text>Total contract value</Text>
          <Text>{formatCents(result.totals.contractRevenueCents)}</Text>
        </View>

        <Text style={styles.h2}>Line items</Text>
        <View style={styles.table}>
          <View style={[styles.tr, styles.th]}>
            <Text style={styles.col1}>Item</Text>
            <Text style={styles.col2}>Monthly</Text>
            <Text style={styles.col3}>Contract</Text>
          </View>
          {result.perTab.map((t) => (
            <View key={`${t.productId}-${t.kind}`} style={styles.tr}>
              <Text style={styles.col1}>
                {t.kind === 'SAAS_USAGE'
                  ? `Subscription (${t.productId})`
                  : t.kind === 'PACKAGED_LABOR'
                    ? `Training & White-glove`
                    : `Professional Services`}
              </Text>
              <Text style={styles.col2}>{formatCents(t.monthlyRevenueCents)}</Text>
              <Text style={styles.col3}>{formatCents(t.contractRevenueCents)}</Text>
            </View>
          ))}
          <View style={[styles.tr, styles.th]}>
            <Text style={styles.col1}>Total</Text>
            <Text style={styles.col2}>{formatCents(result.totals.monthlyRevenueCents)}</Text>
            <Text style={styles.col3}>{formatCents(result.totals.contractRevenueCents)}</Text>
          </View>
        </View>

        <Footer text="Pricing valid for 30 days. All figures USD. Questions: your Ninja Concepts contact." />
      </Page>
    </Document>,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/pdf/customer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/customer.tsx lib/pdf/customer.test.tsx
git commit -m "feat(pdf): customer-facing quote PDF (no cost/margin disclosure)"
```

### Task 4.4-E: Internal-summary PDF

- [ ] **Step 1: Write the failing test**

Create `lib/pdf/internal.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { RenderArgs } from '@/lib/services/quote';

vi.mock('./renderer', () => ({ toBuffer: vi.fn(async () => Buffer.from('PDF')) }));

import { toBuffer } from './renderer';
import { renderInternalPdf } from './internal';

const args: RenderArgs = {
  scenario: { id: 's1', name: 'N', customerName: 'Acme', contractMonths: 12 },
  generatedAt: new Date('2026-04-20T00:00:00Z'),
  version: 2,
  result: {
    perTab: [],
    totals: {
      monthlyCostCents: 100,
      monthlyRevenueCents: 1000,
      contractCostCents: 1200,
      contractRevenueCents: 12000,
      contributionMarginCents: 10800,
      netMarginCents: 10800,
      marginPctContribution: 0.9,
      marginPctNet: 0.9,
    },
    commissions: [
      {
        ruleId: 'r1',
        name: 'House',
        baseAmountCents: 12000,
        commissionAmountCents: 600,
        tierBreakdown: [],
      },
    ],
    warnings: [],
  },
};

describe('renderInternalPdf', () => {
  it('includes cost, margin, and commission text', async () => {
    await renderInternalPdf(args);
    const doc = (toBuffer as any).mock.calls[0][0];
    const serialized = JSON.stringify(doc, (_k, v) => (typeof v === 'function' ? undefined : v));
    expect(serialized.toLowerCase()).toContain('contract cost');
    expect(serialized.toLowerCase()).toContain('contribution margin');
    expect(serialized.toLowerCase()).toContain('commission');
    expect(serialized).toContain('$6.00');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/pdf/internal.test.tsx`
Expected: FAIL with `Cannot find module './internal'`.

- [ ] **Step 3: Implement `internal.tsx`**

Create `lib/pdf/internal.tsx`:

```typescript
import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles, Header, Footer } from './shared';
import { formatCents, formatDate, formatPct } from './format';
import { toBuffer } from './renderer';
import type { RenderArgs } from '@/lib/services/quote';

export async function renderInternalPdf(args: RenderArgs): Promise<Buffer> {
  const { scenario, generatedAt, version, result } = args;
  return toBuffer(
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Header
          title={`Internal summary — ${scenario.name}`}
          customerName={scenario.customerName}
          quoteVersion={version}
          generatedAt={formatDate(generatedAt)}
        />

        <Text style={styles.h2}>Contract totals</Text>
        <View style={styles.row}>
          <Text>Contract revenue</Text>
          <Text>{formatCents(result.totals.contractRevenueCents)}</Text>
        </View>
        <View style={styles.row}>
          <Text>Contract cost</Text>
          <Text>{formatCents(result.totals.contractCostCents)}</Text>
        </View>
        <View style={styles.row}>
          <Text>Contribution margin</Text>
          <Text>
            {formatCents(result.totals.contributionMarginCents)} (
            {formatPct(result.totals.marginPctContribution)})
          </Text>
        </View>
        <View style={styles.row}>
          <Text>Net margin</Text>
          <Text>
            {formatCents(result.totals.netMarginCents)} (
            {formatPct(result.totals.marginPctNet)})
          </Text>
        </View>

        <Text style={styles.h2}>Commissions</Text>
        <View style={styles.table}>
          <View style={[styles.tr, styles.th]}>
            <Text style={styles.col1}>Rule</Text>
            <Text style={styles.col2}>Base</Text>
            <Text style={styles.col3}>Commission</Text>
          </View>
          {result.commissions.map((c) => (
            <View key={c.ruleId} style={styles.tr}>
              <Text style={styles.col1}>{c.name}</Text>
              <Text style={styles.col2}>{formatCents(c.baseAmountCents)}</Text>
              <Text style={styles.col3}>{formatCents(c.commissionAmountCents)}</Text>
            </View>
          ))}
        </View>

        {result.warnings.length > 0 && (
          <>
            <Text style={styles.h2}>Rail warnings</Text>
            {result.warnings.map((w) => (
              <Text key={w.railId}>
                [{w.severity.toUpperCase()}] {w.message}
              </Text>
            ))}
          </>
        )}

        <Footer text="Internal use only. Do not distribute." />
      </Page>
    </Document>,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/pdf/internal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/internal.tsx lib/pdf/internal.test.tsx
git commit -m "feat(pdf): internal-summary PDF with cost/margin/commissions"
```

---

## Phase 4.5 — `/api/quotes/generate` real implementation

**Goal:** Replace the stub 202 with a real handler that composes `generateQuote` with both renderers.

**Files touched:**
- Modify: `app/api/quotes/generate/route.ts`
- Create: `app/api/quotes/generate/route.test.ts`

### Task 4.5-A: Implement the route handler

- [ ] **Step 1: Write the failing test**

Create `app/api/quotes/generate/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth/session', () => ({
  getSessionUser: vi.fn(async () => ({ id: 'u1', role: 'SALES' })),
}));
vi.mock('@/lib/services/quote', () => ({ generateQuote: vi.fn() }));
vi.mock('@/lib/services/rateSnapshot', () => ({
  buildComputeRequest: vi.fn(async (id: string) => {
    if (id === 'missing') throw new (await import('@/lib/utils/errors')).NotFoundError('x');
    return { scenario: { id, ownerId: 'u1' }, request: {} };
  }),
}));

import { POST } from './route';
import { generateQuote } from '@/lib/services/quote';

describe('POST /api/quotes/generate', () => {
  it('returns 400 if scenarioId missing', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
  });

  it('returns 201 with the created quote on success', async () => {
    (generateQuote as any).mockResolvedValue({ id: 'q1', version: 1 });
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ scenarioId: 'scen_1' }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('q1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/quotes/generate/route.test.ts`
Expected: FAIL (stub returns 202 and has no dependency mocks wired to `generateQuote`).

- [ ] **Step 3: Replace the route**

Replace `app/api/quotes/generate/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { buildComputeRequest } from '@/lib/services/rateSnapshot';
import { generateQuote } from '@/lib/services/quote';
import { renderCustomerPdf } from '@/lib/pdf/customer';
import { renderInternalPdf } from '@/lib/pdf/internal';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let scenarioId: string;
  try {
    const body = (await request.json()) as { scenarioId?: unknown };
    if (typeof body.scenarioId !== 'string' || !body.scenarioId) {
      return NextResponse.json({ error: 'scenarioId is required' }, { status: 400 });
    }
    scenarioId = body.scenarioId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    // Ownership check without re-running the engine a second time later.
    const { scenario } = await buildComputeRequest(scenarioId);
    if (user.role === 'SALES' && scenario.ownerId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const quote = await generateQuote(
      { scenarioId, generatedById: user.id },
      { renderPdf: { customer: renderCustomerPdf, internal: renderInternalPdf } },
    );

    return NextResponse.json({ id: quote.id, version: quote.version }, { status: 201 });
  } catch (e) {
    if (e instanceof NotFoundError) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: 422 });
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/quotes/generate/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/quotes/generate/route.ts app/api/quotes/generate/route.test.ts
git commit -m "feat(quotes): implement /api/quotes/generate"
```

---

## Phase 4.6 — Quote history + download route

**Goal:** Sales sees the history of quote versions and can download their own. Admin sees the same plus a separate internal-summary download.

**Files touched:**
- Create: `app/scenarios/[id]/quotes/page.tsx`
- Create: `app/api/quotes/[quoteId]/download/route.ts`
- Create: `app/api/quotes/[quoteId]/download/route.test.ts`
- Modify: `components/scenarios/ScenarioTabNav.tsx` (add Quotes tab)

### Task 4.6-A: Download route with auth + ownership check

- [ ] **Step 1: Write the failing test**

Create `app/api/quotes/[quoteId]/download/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth/session', () => ({
  getSessionUser: vi.fn(),
}));
vi.mock('@/lib/db/repositories/quote', () => ({
  QuoteRepository: vi.fn().mockImplementation(() => ({ findById: vi.fn() })),
}));

import { getSessionUser } from '@/lib/auth/session';
import { QuoteRepository } from '@/lib/db/repositories/quote';
import { GET } from './route';

function req(url: string) {
  return new Request(url);
}

describe('GET /api/quotes/[quoteId]/download', () => {
  it('returns 404 when session is missing (avoid existence leak)', async () => {
    (getSessionUser as any).mockResolvedValue(null);
    const res = await GET(req('http://x'), { params: { quoteId: 'q1' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 when quote not found', async () => {
    (getSessionUser as any).mockResolvedValue({ id: 'u1', role: 'SALES' });
    const findById = vi.fn(async () => null);
    (QuoteRepository as any).mockImplementation(() => ({ findById }));
    const res = await GET(req('http://x'), { params: { quoteId: 'q1' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 when sales user does not own the scenario', async () => {
    (getSessionUser as any).mockResolvedValue({ id: 'u1', role: 'SALES' });
    const findById = vi.fn(async () => ({
      id: 'q1',
      scenario: { id: 's1', ownerId: 'someone-else' },
      pdfUrl: '/tmp/customer.pdf',
      internalPdfUrl: '/tmp/internal.pdf',
    }));
    (QuoteRepository as any).mockImplementation(() => ({ findById }));
    const res = await GET(req('http://x'), { params: { quoteId: 'q1' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 when SALES requests variant=internal', async () => {
    (getSessionUser as any).mockResolvedValue({ id: 'u1', role: 'SALES' });
    const findById = vi.fn(async () => ({
      id: 'q1',
      scenario: { id: 's1', ownerId: 'u1' },
      pdfUrl: '/tmp/customer.pdf',
      internalPdfUrl: '/tmp/internal.pdf',
    }));
    (QuoteRepository as any).mockImplementation(() => ({ findById }));
    const res = await GET(req('http://x?variant=internal'), { params: { quoteId: 'q1' } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/quotes/\[quoteId\]/download/route.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement the download route**

Create `app/api/quotes/[quoteId]/download/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createReadStream, statSync } from 'node:fs';
import { getSessionUser } from '@/lib/auth/session';
import { QuoteRepository } from '@/lib/db/repositories/quote';

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function GET(
  request: Request,
  context: { params: { quoteId: string } },
) {
  const user = await getSessionUser();
  if (!user) return notFound();

  const repo = new QuoteRepository();
  const quote = await repo.findById(context.params.quoteId);
  if (!quote) return notFound();

  const { searchParams } = new URL(request.url);
  const variant = searchParams.get('variant') === 'internal' ? 'internal' : 'customer';

  const isOwner = quote.scenario.ownerId === user.id;
  const isAdmin = user.role === 'ADMIN';
  if (!(isOwner || isAdmin)) return notFound();
  if (variant === 'internal' && !isAdmin) return notFound();

  const filePath = variant === 'internal' ? quote.internalPdfUrl : quote.pdfUrl;
  if (!filePath) return notFound();

  try {
    const stat = statSync(filePath);
    const stream = createReadStream(filePath);
    // Node ReadStream works as a Web-streams-compatible source via Response streaming.
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(stat.size),
        'Content-Disposition': `attachment; filename="quote-${quote.id}-${variant}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return notFound();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/quotes/\[quoteId\]/download/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/quotes/\[quoteId\]/download/route.ts app/api/quotes/\[quoteId\]/download/route.test.ts
git commit -m "feat(quotes): auth-gated download route with 404-on-leak"
```

### Task 4.6-B: Quote history page

- [ ] **Step 1: Implement the page**

Create `app/scenarios/[id]/quotes/page.tsx`:

```typescript
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { QuoteRepository } from '@/lib/db/repositories/quote';

export const dynamic = 'force-dynamic';

export default async function QuotesHistoryPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireAuth();
  const scenario = await prisma.scenario.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, customerName: true, ownerId: true },
  });
  if (!scenario) notFound();
  if (user.role === 'SALES' && scenario.ownerId !== user.id) notFound();

  const repo = new QuoteRepository();
  const quotes = await repo.listByScenario(params.id);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Quote history</h1>
        <p className="text-sm text-muted-foreground">
          {scenario.name} · {scenario.customerName}
        </p>
      </div>

      {quotes.length === 0 ? (
        <p className="text-sm">No quotes generated yet. Use the Generate Quote button in the builder.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left border-b">
            <tr>
              <th className="py-2">Version</th>
              <th>Generated</th>
              <th>By</th>
              <th>Contract total</th>
              <th>Downloads</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => {
              const totals = q.totals as { contractRevenueCents?: number };
              return (
                <tr key={q.id} className="border-b">
                  <td className="py-2">v{q.version}</td>
                  <td>{q.generatedAt.toISOString().slice(0, 10)}</td>
                  <td>{q.generatedBy?.name ?? q.generatedBy?.email ?? '—'}</td>
                  <td>
                    {typeof totals?.contractRevenueCents === 'number'
                      ? `$${(totals.contractRevenueCents / 100).toFixed(2)}`
                      : '—'}
                  </td>
                  <td className="space-x-3">
                    <Link
                      className="underline"
                      href={`/api/quotes/${q.id}/download`}
                      prefetch={false}
                    >
                      Customer PDF
                    </Link>
                    {user.role === 'ADMIN' && (
                      <Link
                        className="underline"
                        href={`/api/quotes/${q.id}/download?variant=internal`}
                        prefetch={false}
                      >
                        Internal summary
                      </Link>
                    )}
                  </td>
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

- [ ] **Step 2: Add `Quotes` to the scenario tab nav**

Edit `components/scenarios/ScenarioTabNav.tsx` — in the `tabs` array definition, add an entry `{ key: 'quotes', label: 'Quotes', href: (id) => \`/scenarios/${id}/quotes\` }` (match the structure of the existing entries; if they use a different shape, mirror that). Keep Quotes last in the list.

- [ ] **Step 3: Verify the page renders**

Run: `npm run build`
Expected: clean build, no type errors.

- [ ] **Step 4: Commit**

```bash
git add app/scenarios/\[id\]/quotes/page.tsx components/scenarios/ScenarioTabNav.tsx
git commit -m "feat(quotes): history page with customer + admin-only internal download"
```

---

## Phase 4.7 — Header button wiring + Playwright smoke

**Goal:** Replace the placeholder `alert('Quote generation is not yet implemented.')` in `ScenarioHeaderButtons.tsx` with real flow: POST, then navigate to the quotes history page (which shows the new version). Add a Playwright smoke test.

**Files touched:**
- Modify: `components/scenarios/ScenarioHeaderButtons.tsx`
- Create or extend: `tests/e2e/quote-generation.spec.ts`

### Task 4.7-A: Wire the Generate Quote button

- [ ] **Step 1: Replace the stub**

Edit `components/scenarios/ScenarioHeaderButtons.tsx`:

```typescript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ScenarioStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';

interface Props {
  scenarioId: string;
  status: ScenarioStatus;
  archiveAction: (formData: FormData) => Promise<void>;
}

export default function ScenarioHeaderButtons({ scenarioId, status, archiveAction }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateQuote() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/quotes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.push(`/scenarios/${scenarioId}/quotes`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quote generation failed');
    } finally {
      setPending(false);
    }
  }

  const canArchive = status !== 'ARCHIVED';

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      {canArchive && (
        <form action={archiveAction}>
          <input type="hidden" name="scenarioId" value={scenarioId} />
          <Button type="submit" variant="outline" size="sm">
            Archive
          </Button>
        </form>
      )}
      <Button
        size="sm"
        data-testid="generate-quote-btn"
        onClick={() => void handleGenerateQuote()}
        disabled={pending}
      >
        {pending ? 'Generating…' : 'Generate Quote'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/scenarios/ScenarioHeaderButtons.tsx
git commit -m "feat(quotes): wire Generate Quote button to real endpoint"
```

### Task 4.7-B: Playwright smoke (extends Phase 3 smoke)

**Note:** Phase 3 established the Playwright harness in `tests/e2e/`. If that file already exists and covers login → scenario creation, extend it; if Playwright is not installed yet, skip this task and open a follow-up issue noting "Phase 4 Playwright smoke deferred — no e2e harness present."

- [ ] **Step 1: Check for existing Playwright setup**

Run: `ls tests/e2e/ 2>/dev/null && cat playwright.config.ts 2>/dev/null | head -3`

If both files exist, proceed to Step 2. If not, skip Steps 2–4 and commit a single-line note in `docs/superpowers/plans/phase-4-review-followups.md` titled "Playwright smoke deferred — no e2e harness present," then `git commit -m "docs(phase-4): note deferred playwright smoke"` and finish this sub-phase.

- [ ] **Step 2: Extend an existing smoke test**

Append to whichever existing e2e file covers scenario creation (typically `tests/e2e/scenario-builder.spec.ts`):

```typescript
import { test, expect } from '@playwright/test';

test('generate quote from scenario builder produces a downloadable version', async ({ page, baseURL }) => {
  // Assumes a scenario already created by previous smoke test steps, or create one here.
  await page.goto('/scenarios');
  await page.getByRole('link', { name: /new scenario/i }).click();
  await page.getByLabel(/scenario name/i).fill('Quote smoke');
  await page.getByLabel(/customer name/i).fill('Acme');
  await page.getByLabel(/contract months/i).fill('12');
  await page.getByRole('button', { name: /create/i }).click();

  await page.getByTestId('generate-quote-btn').click();
  await page.waitForURL(/\/scenarios\/.+\/quotes$/);

  const row = page.locator('tr', { hasText: 'v1' });
  await expect(row).toBeVisible();

  // Download link exists; opening a PDF in Playwright is flaky, so assert the href only.
  const href = await row.getByRole('link', { name: /customer pdf/i }).getAttribute('href');
  expect(href).toMatch(/^\/api\/quotes\/.+\/download$/);
});
```

- [ ] **Step 3: Run the smoke**

Run: `npx playwright test tests/e2e/scenario-builder.spec.ts`
Expected: PASS (including new test).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/scenario-builder.spec.ts
git commit -m "test(e2e): smoke for quote generation flow"
```

---

## File Map Summary

**Created:**
- `lib/utils/quoteStorage.ts` + `.test.ts`
- `lib/db/repositories/quote.ts` + `.test.ts`
- `lib/services/rateSnapshot.ts` + `.test.ts`
- `lib/services/quote.ts` + `.test.ts`
- `lib/pdf/format.ts` + `.test.ts`
- `lib/pdf/shared.tsx`
- `lib/pdf/renderer.ts`
- `lib/pdf/customer.tsx` + `.test.tsx`
- `lib/pdf/internal.tsx` + `.test.tsx`
- `app/api/quotes/generate/route.test.ts`
- `app/api/quotes/[quoteId]/download/route.ts` + `.test.ts`
- `app/scenarios/[id]/quotes/page.tsx`
- `tests/e2e/scenario-builder.spec.ts` (extended; may be skipped if Playwright is not yet installed)

**Modified:**
- `package.json`, `package-lock.json` (dep)
- `.env.example`, `.gitignore`, `README.md`
- `lib/db/repositories/index.ts`
- `lib/services/index.ts`
- `app/api/compute/route.ts` (delegates to `rateSnapshot.ts`)
- `app/api/quotes/generate/route.ts` (replaces stub)
- `components/scenarios/ScenarioHeaderButtons.tsx` (wires fetch)
- `components/scenarios/ScenarioTabNav.tsx` (adds Quotes tab)

---

## Risks

- **`@react-pdf/renderer` in Next.js server bundle.** The package ships ESM + CommonJS and occasionally trips Next's server-components bundler. If the first `npm run build` fails with a module resolution error, mark the PDF helpers with `"use server"` where called, or add `serverComponentsExternalPackages: ['@react-pdf/renderer']` to `next.config.mjs`. Fallback is documented but not pre-applied to keep the diff minimal.
- **Fonts.** Default `Helvetica` ships with `@react-pdf/renderer` and needs no registration. If brand fonts are added later, they must be registered in `lib/pdf/shared.tsx` — v2 concern.
- **Volume persistence.** Railway volumes can be detached/reattached between deploys. Mount the volume at `QUOTE_STORAGE_DIR` in the Railway service config before this ships, or quote history downloads will 404 after any redeploy. Document in the runbook update task (4.0-B Step 3).
- **Versioning race.** Two concurrent "Generate Quote" clicks race to `(scenarioId, version=N)`. The unique index catches it; the retry loop in `generateQuote` recovers. Disk writes use a `Date.now()` suffix so retries don't overwrite each other's files.

---

## Milestones

1. **Phase 4.0 done** — deps + env + storage helpers land; CI green.
2. **Phase 4.1–4.3 done** — service layer writes a quote row with frozen totals; no PDFs rendered yet (PDFs mocked in tests).
3. **Phase 4.4 done** — both PDF variants render to `Buffer` given a fixture `ComputeResult`.
4. **Phase 4.5 done** — POST `/api/quotes/generate` returns a 201 + quote id/version for a real scenario.
5. **Phase 4.6 done** — history page and download route shipped; sales sees customer PDF, admin sees both.
6. **Phase 4.7 done** — builder button works; Playwright smoke green (or deferred with a filed note).

---

## Acceptance Criteria

### Functional

- Clicking **Generate Quote** on a non-archived scenario produces a new row in `Quote` with the next sequential `version` for that scenario, writes two PDFs to disk, and navigates to `/scenarios/[id]/quotes`.
- Customer PDF contains: scenario name, customer name, contract months, total contract revenue, per-tab monthly + contract revenue. Contains no occurrences (case-insensitive) of "cost" or "margin".
- Internal PDF additionally contains: contract cost, contribution margin, net margin, commissions table, rail warnings (if any).
- `/scenarios/[id]/quotes` shows rows sorted by version DESC; each row exposes a customer-PDF link; admin users additionally see an internal-summary link.
- `GET /api/quotes/[quoteId]/download` returns 404 for unauthenticated users, 404 for sales users who don't own the scenario, 404 for any user if `variant=internal` and the user is not admin, 200 + `application/pdf` otherwise.
- Two concurrent POSTs to `/api/quotes/generate` for the same scenario each return 201 with distinct versions (second call uses the retry path).

### Non-functional

- All new unit/integration tests pass on CI.
- `npm run lint` and `npx tsc --noEmit` stay clean.
- No file in `lib/pdf/` imports Prisma; no file in `lib/pdf/` or `lib/services/quote.ts` imports `next/server` or `next/navigation`.
- No direct `fs` usage outside `lib/utils/quoteStorage.ts` and `app/api/quotes/[quoteId]/download/route.ts`.

---

## Phase 4 → v1 release handoff

At the end of Phase 4:

- V1 feature set per the design doc is complete: admin configures, sales builds scenarios, both parties receive the appropriate PDFs.
- Railway deploy checklist update: ensure the persistent volume is mounted at the path referenced by `QUOTE_STORAGE_DIR`.
- The quote stub (`/api/quotes/generate` returning 202) and the placeholder alert are gone.
- `docs/superpowers/plans/phase-4-review-followups.md` captures anything deferred (Playwright harness, S3 storage, branded fonts) for the post-v1 cycle.
