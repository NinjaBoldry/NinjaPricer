# Ninja Pricer v2 — Phase 6: Omni Products + Metered SaaS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Omni Sales (per-seat, catalog-only) and Omni Concierge (new METERED revenue model) as v2 SaaS products, with the engine, services, admin UI, sales UI, quote PDF, and HubSpot translators all supporting the new metered primitive.

**Architecture:** Extend `SAAS_USAGE` with a `revenueModel: PER_SEAT | METERED` discriminator on `Product`. Metered-specific data lives in a new 1:1 `MeteredPricing` table. Engine's `computeSaaSTab` dispatches on `revenueModel` to a new `computeMeteredSaaSTab` path. Per-seat primitives (ListPrice, VolumeDiscountTier, Persona, OtherVariable, BaseUsage) are PER_SEAT-only; service layer enforces the invariant. Rails/commissions/fixed costs/contract modifiers are reused as-is.

**Tech Stack:** Prisma, TypeScript strict, Next.js 14 app router, Vitest, `@modelcontextprotocol/sdk`, `@react-pdf/renderer`, `decimal.js`.

**Design spec:** [docs/superpowers/specs/2026-04-23-v2-phase-6-omni-products-and-metered-saas-design.md](../specs/2026-04-23-v2-phase-6-omni-products-and-metered-saas-design.md)

---

## Conventions (inherited from prior phases)

- **TDD.** Failing test → run → implement → pass → commit.
- Constructor-injected `PrismaClient` for repositories; services expose Zod-parseable methods.
- Tools never import Prisma; they call services.
- Zod at the tool boundary; services defensively re-validate.
- Typed errors (`NotFoundError`, `ValidationError`) → MCP error codes via `lib/mcp/errors.ts`.
- Money in integer cents at engine boundaries; `decimal.js` internally; UI formats for display.
- Conventional commits; one commit per sub-task (sub-task = one `###` section).
- All new code must pass `npx tsc --noEmit`, `npx eslint`, and `npx prettier --check`.

---

## Task 6-A: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_phase_6_metered_saas/migration.sql` (generated)

- [ ] **Step 1: Add the enum in `prisma/schema.prisma`**

After the existing `enum ScenarioStatus { ... }` block, add:

```prisma
enum SaaSRevenueModel {
  PER_SEAT
  METERED
}
```

- [ ] **Step 2: Add `revenueModel` to `Product`**

In the `model Product { ... }` block, after the `kind ProductKind` line, add:

```prisma
  revenueModel SaaSRevenueModel @default(PER_SEAT)
```

Also add this relation to the Product model (alongside `listPrice`, `scale`, etc.):

```prisma
  meteredPricing        MeteredPricing?
```

- [ ] **Step 3: Add the `MeteredPricing` model**

Immediately after the `ListPrice` model block, add:

```prisma
model MeteredPricing {
  id                     String  @id @default(cuid())
  productId              String  @unique
  unitLabel              String
  includedUnitsPerMonth  Int
  committedMonthlyUsd    Decimal @db.Decimal(18, 4)
  overageRatePerUnitUsd  Decimal @db.Decimal(18, 6)
  costPerUnitUsd         Decimal @db.Decimal(18, 6)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  product                Product @relation(fields: [productId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 4: Add the two nullable fields to `ScenarioSaaSConfig`**

Find the `model ScenarioSaaSConfig { ... }` block. Add after the existing scenario-config fields:

```prisma
  committedUnitsPerMonth      Int?
  expectedActualUnitsPerMonth Int?
```

- [ ] **Step 5: Generate the migration**

Run:
```bash
npx prisma migrate dev --name phase_6_metered_saas --create-only
```

Expected: a new directory `prisma/migrations/<timestamp>_phase_6_metered_saas/` with `migration.sql`. Inspect that SQL: should contain `CREATE TYPE "SaaSRevenueModel"`, `ALTER TABLE "Product" ADD COLUMN "revenueModel"`, `CREATE TABLE "MeteredPricing"`, `ALTER TABLE "ScenarioSaaSConfig" ADD COLUMN ...`. No other tables touched.

- [ ] **Step 6: Apply migration + regenerate client**

```bash
npx prisma migrate dev
npx prisma generate
```

Expected: migration applies cleanly; `npx tsc --noEmit` still passes (existing code is unaffected — new fields are additive).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(phase-6): prisma schema + migration for metered SaaS"
```

---

## Task 6-B: Engine type additions

**Files:**
- Modify: `lib/engine/types.ts`

- [ ] **Step 1: Add the discriminator + metered snap types**

In `lib/engine/types.ts`, replace the `SaaSProductSnap` interface (currently at line 39) with the following. Keep every existing field; add `revenueModel` and `meteredPricing`:

```typescript
export type SaaSRevenueModel = 'PER_SEAT' | 'METERED';

export interface MeteredPricingSnap {
  unitLabel: string;
  includedUnitsPerMonth: number;
  committedMonthlyUsd: Decimal;
  overageRatePerUnitUsd: Decimal;
  costPerUnitUsd: Decimal;
}

export interface SaaSProductSnap {
  kind: 'SAAS_USAGE';
  productId: string;
  revenueModel: SaaSRevenueModel;
  vendorRates: VendorRateSnap[];
  baseUsage: BaseUsageSnap[];
  otherVariableUsdPerUserPerMonth: Decimal;
  personas: PersonaSnap[];
  fixedCosts: ProductFixedCostSnap[];
  activeUsersAtScale: number;
  listPriceUsdPerSeatPerMonth: Decimal;
  volumeTiers: VolumeTierSnap[];
  contractModifiers: ContractModifierSnap[];
  meteredPricing: MeteredPricingSnap | null;
}
```

- [ ] **Step 2: Extend `SaaSTabInput` with metered fields**

Replace the `SaaSTabInput` interface in the same file:

```typescript
export interface SaaSTabInput {
  kind: 'SAAS_USAGE';
  productId: string;
  // PER_SEAT fields (required for PER_SEAT, ignored for METERED)
  seatCount: number;
  personaMix: { personaId: string; pct: number }[];
  discountOverridePct?: Decimal;
  // METERED fields (required for METERED, ignored for PER_SEAT)
  committedUnitsPerMonth?: number;
  expectedActualUnitsPerMonth?: number;
}
```

- [ ] **Step 3: Extend `SaaSMeta` with metered breakdown fields**

Replace `SaaSMeta`:

```typescript
export interface SaaSMeta {
  effectiveDiscountPct: Decimal;
  // metered breakdown — populated only for METERED compute path
  metered?: {
    includedUnitsPerMonth: number;
    committedMonthlyUsd: Decimal;
    overageUnits: number;
    overageRatePerUnitUsd: Decimal;
    contractDiscountPct: Decimal;
  };
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`

Expected: compile errors in `lib/engine/saas-tab.ts`, `lib/services/rateSnapshot.ts`, and any fixture/test builders that construct `SaaSProductSnap` literals — they need the new `revenueModel` and `meteredPricing` fields. This is expected; subsequent tasks fix them.

- [ ] **Step 5: Add default fields to existing SaaS snap fixtures**

Run:
```bash
grep -rln "kind: 'SAAS_USAGE'" lib/engine/tests lib/engine/saas-tab.test.ts lib/engine/compute.test.ts lib/engine/saas-cost.test.ts lib/engine/saas-discount.test.ts lib/engine/rails.test.ts
```

In every `SaaSProductSnap`-literal in those files, add:

```typescript
  revenueModel: 'PER_SEAT',
  meteredPricing: null,
```

(usually after the `productId: 'xxx',` line). These are existing per-seat fixtures; both fields carry their defaults.

- [ ] **Step 6: Typecheck again**

Run: `npx tsc --noEmit`

Expected: engine tests compile. `lib/services/rateSnapshot.ts` still errors — fixed in Task 6-F.

- [ ] **Step 7: Run existing engine tests to confirm no behavior change**

Run: `npx vitest run lib/engine`

Expected: all existing tests pass. (Engine behavior is unchanged; only types added.)

- [ ] **Step 8: Commit**

```bash
git add lib/engine
git commit -m "feat(phase-6): engine types — SaaS revenueModel discriminator + metered snap"
```

---

## Task 6-C: Engine — metered compute path

**Files:**
- Create: `lib/engine/metered-saas-tab.ts`
- Create: `lib/engine/metered-saas-tab.test.ts`
- Modify: `lib/engine/saas-tab.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/engine/metered-saas-tab.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeMeteredSaaSTab } from './metered-saas-tab';
import type { SaaSProductSnap, SaaSTabInput } from './types';
import { d } from '@/lib/utils/money';

function meteredProduct(): SaaSProductSnap {
  return {
    kind: 'SAAS_USAGE',
    productId: 'p-concierge',
    revenueModel: 'METERED',
    vendorRates: [],
    baseUsage: [],
    otherVariableUsdPerUserPerMonth: d(0),
    personas: [],
    fixedCosts: [{ id: 'fc1', name: 'support', monthlyUsd: d(100) }],
    activeUsersAtScale: 0,
    listPriceUsdPerSeatPerMonth: d(0),
    volumeTiers: [],
    contractModifiers: [
      { minMonths: 24, additionalDiscountPct: d(0.05) },
      { minMonths: 36, additionalDiscountPct: d(0.1) },
    ],
    meteredPricing: {
      unitLabel: 'minute',
      includedUnitsPerMonth: 5000,
      committedMonthlyUsd: d(2500),
      overageRatePerUnitUsd: d(0.5),
      costPerUnitUsd: d(0.2),
    },
  };
}

function meteredInput(overrides: Partial<SaaSTabInput> = {}): SaaSTabInput {
  return {
    kind: 'SAAS_USAGE',
    productId: 'p-concierge',
    seatCount: 0,
    personaMix: [],
    committedUnitsPerMonth: 5000,
    expectedActualUnitsPerMonth: 5000,
    ...overrides,
  };
}

describe('computeMeteredSaaSTab', () => {
  it('usage exactly at included — no overage, no contract discount', () => {
    const out = computeMeteredSaaSTab(meteredInput(), meteredProduct(), 12);
    // revenue = 2500 committed (no contract discount at 12 mo)
    expect(out.monthlyRevenueCents).toBe(250000);
    // cost = 5000 * 0.20 + 100 fixed = 1100
    expect(out.monthlyCostCents).toBe(110000);
    expect(out.saasMeta?.metered?.overageUnits).toBe(0);
    expect(out.saasMeta?.metered?.contractDiscountPct.toNumber()).toBe(0);
  });

  it('usage under included — no overage, cost reflects actual usage', () => {
    const out = computeMeteredSaaSTab(
      meteredInput({ expectedActualUnitsPerMonth: 3000 }),
      meteredProduct(),
      12,
    );
    expect(out.monthlyRevenueCents).toBe(250000); // still pay committed
    expect(out.monthlyCostCents).toBe(60000 + 10000); // 3000 * 0.20 + 100 fixed
  });

  it('usage over included — overage applied at overage rate, NOT discounted', () => {
    const out = computeMeteredSaaSTab(
      meteredInput({ expectedActualUnitsPerMonth: 6200 }),
      meteredProduct(),
      36,
    );
    // committed = 2500 * (1 - 0.10) = 2250
    // overage = (6200 - 5000) * 0.50 = 600  (NOT discounted)
    // monthly revenue = 2250 + 600 = 2850
    expect(out.monthlyRevenueCents).toBe(285000);
    // cost = 6200 * 0.20 + 100 fixed = 1340
    expect(out.monthlyCostCents).toBe(134000);
    expect(out.saasMeta?.metered?.overageUnits).toBe(1200);
    expect(out.saasMeta?.metered?.contractDiscountPct.toNumber()).toBe(0.1);
  });

  it('contract total = (monthlyRevenue - monthlyCost) * contractMonths', () => {
    const out = computeMeteredSaaSTab(
      meteredInput({ expectedActualUnitsPerMonth: 6200 }),
      meteredProduct(),
      36,
    );
    expect(out.contractRevenueCents).toBe(285000 * 36);
    expect(out.contractCostCents).toBe(134000 * 36);
    expect(out.contributionMarginCents).toBe(285000 * 36 - 134000 * 36);
  });

  it('throws if meteredPricing is null', () => {
    const product = { ...meteredProduct(), meteredPricing: null };
    expect(() => computeMeteredSaaSTab(meteredInput(), product, 12)).toThrow(/METERED.*pricing/);
  });

  it('throws on negative committedUnitsPerMonth', () => {
    expect(() =>
      computeMeteredSaaSTab(meteredInput({ committedUnitsPerMonth: -1 }), meteredProduct(), 12),
    ).toThrow();
  });

  it('throws on negative expectedActualUnitsPerMonth', () => {
    expect(() =>
      computeMeteredSaaSTab(
        meteredInput({ expectedActualUnitsPerMonth: -1 }),
        meteredProduct(),
        12,
      ),
    ).toThrow();
  });

  it('throws on non-positive contractMonths', () => {
    expect(() => computeMeteredSaaSTab(meteredInput(), meteredProduct(), 0)).toThrow();
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `npx vitest run lib/engine/metered-saas-tab.test.ts`
Expected: FAIL with module-not-found for `./metered-saas-tab`.

- [ ] **Step 3: Implement `computeMeteredSaaSTab`**

Create `lib/engine/metered-saas-tab.ts`:

```typescript
import { d, toCents } from '@/lib/utils/money';
import type { SaaSProductSnap, SaaSTabInput, TabResult, SaaSMeta } from './types';
import { ValidationError } from '@/lib/utils/errors';

export function computeMeteredSaaSTab(
  tab: SaaSTabInput,
  product: SaaSProductSnap,
  contractMonths: number,
): TabResult {
  if (product.meteredPricing === null) {
    throw new ValidationError('meteredPricing', 'METERED product requires pricing');
  }
  const committed = tab.committedUnitsPerMonth ?? product.meteredPricing.includedUnitsPerMonth;
  const expected = tab.expectedActualUnitsPerMonth ?? committed;
  if (committed < 0) throw new ValidationError('committedUnitsPerMonth', 'must be >= 0');
  if (expected < 0) throw new ValidationError('expectedActualUnitsPerMonth', 'must be >= 0');
  if (contractMonths <= 0) throw new ValidationError('contractMonths', 'must be > 0');

  const mp = product.meteredPricing;

  // contract-length discount applies only to committed, not overage
  const contractDiscountPct = product.contractModifiers
    .filter((m) => contractMonths >= m.minMonths)
    .reduce((acc, m) => (m.additionalDiscountPct.gt(acc) ? m.additionalDiscountPct : acc), d(0));
  const discountedCommitted = mp.committedMonthlyUsd.mul(d(1).minus(contractDiscountPct));

  const overageUnits = Math.max(0, expected - mp.includedUnitsPerMonth);
  const overageRevenue = mp.overageRatePerUnitUsd.mul(overageUnits);
  const monthlyRevenue = discountedCommitted.plus(overageRevenue);

  const usageCost = mp.costPerUnitUsd.mul(expected);
  const fixedCost = product.fixedCosts.reduce((acc, fc) => acc.plus(fc.monthlyUsd), d(0));
  const monthlyCost = usageCost.plus(fixedCost);

  const monthlyCostCents = toCents(monthlyCost);
  const monthlyRevenueCents = toCents(monthlyRevenue);
  const contractCostCents = toCents(monthlyCost.mul(contractMonths));
  const contractRevenueCents = toCents(monthlyRevenue.mul(contractMonths));
  const contributionMarginCents = contractRevenueCents - contractCostCents;

  const saasMeta: SaaSMeta = {
    effectiveDiscountPct: contractDiscountPct,
    metered: {
      includedUnitsPerMonth: mp.includedUnitsPerMonth,
      committedMonthlyUsd: mp.committedMonthlyUsd,
      overageUnits,
      overageRatePerUnitUsd: mp.overageRatePerUnitUsd,
      contractDiscountPct,
    },
  };

  return {
    productId: tab.productId,
    kind: 'SAAS_USAGE',
    monthlyCostCents,
    monthlyRevenueCents,
    oneTimeCostCents: 0,
    oneTimeRevenueCents: 0,
    contractCostCents,
    contractRevenueCents,
    contributionMarginCents,
    saasMeta,
  };
}
```

- [ ] **Step 4: Dispatch from `computeSaaSTab`**

In `lib/engine/saas-tab.ts`, modify the top of the exported function to dispatch on `revenueModel`. Replace the first line of the function body with:

```typescript
export function computeSaaSTab(
  tab: SaaSTabInput,
  product: SaaSProductSnap,
  contractMonths: number,
): TabResult {
  if (product.revenueModel === 'METERED') {
    // Imported at top of file in the next step.
    return computeMeteredSaaSTab(tab, product, contractMonths);
  }
  if (tab.seatCount < 0) throw new ValidationError('seatCount', 'must be >= 0');
  // ... rest of existing per-seat body unchanged
```

Add the import at the top of `lib/engine/saas-tab.ts`:

```typescript
import { computeMeteredSaaSTab } from './metered-saas-tab';
```

- [ ] **Step 5: Run metered tests**

Run: `npx vitest run lib/engine/metered-saas-tab.test.ts`
Expected: PASS all 8 cases.

- [ ] **Step 6: Run entire engine test suite**

Run: `npx vitest run lib/engine`
Expected: PASS — per-seat tests unchanged.

- [ ] **Step 7: Commit**

```bash
git add lib/engine
git commit -m "feat(phase-6): metered SaaS engine path + dispatch in computeSaaSTab"
```

---

## Task 6-D: Engine — golden fixture for mixed scenario

**Files:**
- Create: `lib/engine/tests/fixtures/metered-mixed.test.ts`

- [ ] **Step 1: Inspect existing fixture style**

Run: `ls lib/engine/tests/`

Examine an existing fixture test (e.g. `lib/engine/compute.test.ts`) to understand the existing `compute({ ... })` call shape and the `ComputeRequest` literal style.

- [ ] **Step 2: Write the golden fixture test**

Create `lib/engine/tests/fixtures/metered-mixed.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { compute } from '@/lib/engine';
import { d } from '@/lib/utils/money';
import type { ComputeRequest } from '@/lib/engine/types';

describe('golden: mixed scenario — per-seat + metered + labor', () => {
  const request: ComputeRequest = {
    contractMonths: 36,
    tabs: [
      {
        kind: 'SAAS_USAGE',
        productId: 'p-notes',
        seatCount: 50,
        personaMix: [{ personaId: 'pers-power', pct: 1 }],
      },
      {
        kind: 'SAAS_USAGE',
        productId: 'p-concierge',
        seatCount: 0,
        personaMix: [],
        committedUnitsPerMonth: 5000,
        expectedActualUnitsPerMonth: 6200,
      },
    ],
    products: {
      saas: {
        'p-notes': {
          kind: 'SAAS_USAGE',
          productId: 'p-notes',
          revenueModel: 'PER_SEAT',
          vendorRates: [{ id: 'v1', name: 'api', unitLabel: 'call', rateUsd: d(0.001) }],
          baseUsage: [{ vendorRateId: 'v1', usagePerMonth: d(1000) }],
          otherVariableUsdPerUserPerMonth: d(1),
          personas: [{ id: 'pers-power', name: 'power', multiplier: d(1) }],
          fixedCosts: [],
          activeUsersAtScale: 100,
          listPriceUsdPerSeatPerMonth: d(50),
          volumeTiers: [],
          contractModifiers: [{ minMonths: 36, additionalDiscountPct: d(0.1) }],
          meteredPricing: null,
        },
        'p-concierge': {
          kind: 'SAAS_USAGE',
          productId: 'p-concierge',
          revenueModel: 'METERED',
          vendorRates: [],
          baseUsage: [],
          otherVariableUsdPerUserPerMonth: d(0),
          personas: [],
          fixedCosts: [],
          activeUsersAtScale: 0,
          listPriceUsdPerSeatPerMonth: d(0),
          volumeTiers: [],
          contractModifiers: [{ minMonths: 36, additionalDiscountPct: d(0.1) }],
          meteredPricing: {
            unitLabel: 'minute',
            includedUnitsPerMonth: 5000,
            committedMonthlyUsd: d(2500),
            overageRatePerUnitUsd: d(0.5),
            costPerUnitUsd: d(0.2),
          },
        },
      },
      laborSKUs: {},
      departments: {},
    },
    commissionRules: [],
    rails: [],
  };

  it('computes per-tab + aggregate correctly', () => {
    const out = compute(request);
    expect(out.perTab).toHaveLength(2);

    const notes = out.perTab.find((t) => t.productId === 'p-notes')!;
    const concierge = out.perTab.find((t) => t.productId === 'p-concierge')!;

    // Concierge: committed 2250 (10% discount), overage 600 (undiscounted), expected cost 6200*0.20
    expect(concierge.monthlyRevenueCents).toBe(285000);
    expect(concierge.monthlyCostCents).toBe(124000);
    expect(concierge.contractRevenueCents).toBe(285000 * 36);

    // Notes keeps per-seat math unchanged by phase-6 code.
    expect(notes.monthlyRevenueCents).toBeGreaterThan(0);

    // Aggregate sums tabs
    expect(out.totals.contractRevenueCents).toBe(
      notes.contractRevenueCents + concierge.contractRevenueCents,
    );
  });
});
```

- [ ] **Step 3: Run to pass**

Run: `npx vitest run lib/engine/tests/fixtures/metered-mixed.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/engine/tests
git commit -m "test(phase-6): golden fixture — mixed per-seat + metered scenario"
```

---

## Task 6-E: MeteredPricing repository

**Files:**
- Create: `lib/db/repositories/meteredPricing.ts`
- Create: `lib/db/repositories/meteredPricing.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/db/repositories/meteredPricing.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeteredPricingRepository } from './meteredPricing';

describe('MeteredPricingRepository', () => {
  let prisma: any;
  let repo: MeteredPricingRepository;

  beforeEach(() => {
    prisma = {
      meteredPricing: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
      },
    };
    repo = new MeteredPricingRepository(prisma);
  });

  it('findByProductId — returns row', async () => {
    prisma.meteredPricing.findUnique.mockResolvedValue({ id: 'm1', productId: 'p1' });
    const out = await repo.findByProductId('p1');
    expect(prisma.meteredPricing.findUnique).toHaveBeenCalledWith({ where: { productId: 'p1' } });
    expect(out).toEqual({ id: 'm1', productId: 'p1' });
  });

  it('upsert — creates or updates by productId', async () => {
    prisma.meteredPricing.upsert.mockResolvedValue({ id: 'm1' });
    const data = {
      unitLabel: 'minute',
      includedUnitsPerMonth: 5000,
      committedMonthlyUsd: 2500,
      overageRatePerUnitUsd: 0.5,
      costPerUnitUsd: 0.2,
    };
    await repo.upsert('p1', data);
    expect(prisma.meteredPricing.upsert).toHaveBeenCalledWith({
      where: { productId: 'p1' },
      create: { productId: 'p1', ...data },
      update: data,
    });
  });

  it('delete — by productId', async () => {
    prisma.meteredPricing.delete.mockResolvedValue({});
    await repo.deleteByProductId('p1');
    expect(prisma.meteredPricing.delete).toHaveBeenCalledWith({ where: { productId: 'p1' } });
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `npx vitest run lib/db/repositories/meteredPricing.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `lib/db/repositories/meteredPricing.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';

export interface MeteredPricingInput {
  unitLabel: string;
  includedUnitsPerMonth: number;
  committedMonthlyUsd: number | string;
  overageRatePerUnitUsd: number | string;
  costPerUnitUsd: number | string;
}

export class MeteredPricingRepository {
  constructor(private prisma: PrismaClient) {}

  async findByProductId(productId: string) {
    return this.prisma.meteredPricing.findUnique({ where: { productId } });
  }

  async upsert(productId: string, data: MeteredPricingInput) {
    return this.prisma.meteredPricing.upsert({
      where: { productId },
      create: { productId, ...data },
      update: data,
    });
  }

  async deleteByProductId(productId: string) {
    return this.prisma.meteredPricing.delete({ where: { productId } });
  }
}
```

- [ ] **Step 4: Run to pass**

Run: `npx vitest run lib/db/repositories/meteredPricing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/repositories/meteredPricing.ts lib/db/repositories/meteredPricing.test.ts
git commit -m "feat(phase-6): MeteredPricing repository"
```

---

## Task 6-F: Rate snapshot — include revenueModel + metered pricing

**Files:**
- Modify: `lib/services/rateSnapshot.ts`
- Modify: `lib/services/rateSnapshot.test.ts`

- [ ] **Step 1: Inspect current shape**

Run: `grep -n "saas:" lib/services/rateSnapshot.ts | head -5` and read the section that maps DB rows into `SaaSProductSnap`. Note which fields the code sets (e.g. `listPriceUsdPerSeatPerMonth`, `volumeTiers`, etc.).

- [ ] **Step 2: Update the Prisma include**

In `lib/services/rateSnapshot.ts`, find the `prisma.product.findMany({ where: { id: { in: saasProductIds } }, include: { ... } })` call and add `meteredPricing: true` to the include object.

- [ ] **Step 3: Populate `revenueModel` + `meteredPricing` in the snap mapping**

In the block that constructs `SaaSProductSnap` literals (usually a `.map(...)` over the fetched products, or assigns into `saas[id] = { ... }`), add:

```typescript
  revenueModel: product.revenueModel,  // from the DB row
  meteredPricing: product.meteredPricing
    ? {
        unitLabel: product.meteredPricing.unitLabel,
        includedUnitsPerMonth: product.meteredPricing.includedUnitsPerMonth,
        committedMonthlyUsd: d(product.meteredPricing.committedMonthlyUsd.toString()),
        overageRatePerUnitUsd: d(product.meteredPricing.overageRatePerUnitUsd.toString()),
        costPerUnitUsd: d(product.meteredPricing.costPerUnitUsd.toString()),
      }
    : null,
```

- [ ] **Step 4: Pass scenario-config metered fields into tab inputs**

In the same file, find where `TabInput` / `SaaSTabInput` is built from `scenario.saasConfigs`. Add the two optional fields:

```typescript
  committedUnitsPerMonth: cfg.committedUnitsPerMonth ?? undefined,
  expectedActualUnitsPerMonth: cfg.expectedActualUnitsPerMonth ?? undefined,
```

- [ ] **Step 5: Update the repository test fixtures**

Open `lib/services/rateSnapshot.test.ts`. For any mocked Prisma-product row, add `revenueModel: 'PER_SEAT'` and `meteredPricing: null`. Add ONE new test case covering a METERED product:

```typescript
it('includes meteredPricing and revenueModel for METERED products', async () => {
  // arrange a product with revenueModel: 'METERED' + meteredPricing row
  // ...
  // assert the resulting SaaSProductSnap.revenueModel === 'METERED' and
  // meteredPricing is populated as Decimals
});
```

Model this off the nearest existing test in the file — use the same mocking patterns.

- [ ] **Step 6: Typecheck + run**

```bash
npx tsc --noEmit
npx vitest run lib/services/rateSnapshot.test.ts
```

Expected: both pass.

- [ ] **Step 7: Run full test suite for regressions**

Run: `npx vitest run`
Expected: no regressions. If any other test constructs a mocked Prisma product row, add `revenueModel: 'PER_SEAT', meteredPricing: null` as needed.

- [ ] **Step 8: Commit**

```bash
git add lib/services/rateSnapshot.ts lib/services/rateSnapshot.test.ts
git commit -m "feat(phase-6): rate snapshot includes revenueModel + meteredPricing"
```

---

## Task 6-G: MeteredPricing service

**Files:**
- Create: `lib/services/meteredPricing.ts`
- Create: `lib/services/meteredPricing.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/services/meteredPricing.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeteredPricingService } from './meteredPricing';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';

describe('MeteredPricingService', () => {
  let prisma: any;
  let svc: MeteredPricingService;

  beforeEach(() => {
    prisma = {
      product: { findUnique: vi.fn() },
      meteredPricing: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    };
    svc = new MeteredPricingService(prisma);
  });

  describe('get', () => {
    it('returns pricing row', async () => {
      prisma.meteredPricing.findUnique.mockResolvedValue({ id: 'm1', productId: 'p1' });
      expect(await svc.get('p1')).toEqual({ id: 'm1', productId: 'p1' });
    });

    it('returns null if not found', async () => {
      prisma.meteredPricing.findUnique.mockResolvedValue(null);
      expect(await svc.get('p1')).toBeNull();
    });
  });

  describe('set', () => {
    const validInput = {
      unitLabel: 'minute',
      includedUnitsPerMonth: 5000,
      committedMonthlyUsd: 2500,
      overageRatePerUnitUsd: 0.5,
      costPerUnitUsd: 0.2,
    };

    it('upserts when product is SAAS_USAGE + METERED', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        kind: 'SAAS_USAGE',
        revenueModel: 'METERED',
      });
      prisma.meteredPricing.upsert.mockResolvedValue({ id: 'm1' });
      const out = await svc.set('p1', validInput);
      expect(out).toEqual({ id: 'm1' });
    });

    it('throws NotFoundError when product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(svc.set('p1', validInput)).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError when product is not SAAS_USAGE', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        kind: 'PACKAGED_LABOR',
        revenueModel: 'PER_SEAT',
      });
      await expect(svc.set('p1', validInput)).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when revenueModel is PER_SEAT', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        kind: 'SAAS_USAGE',
        revenueModel: 'PER_SEAT',
      });
      await expect(svc.set('p1', validInput)).rejects.toThrow(ValidationError);
    });

    it('rejects negative includedUnitsPerMonth', async () => {
      await expect(svc.set('p1', { ...validInput, includedUnitsPerMonth: -1 })).rejects.toThrow();
    });

    it('rejects non-positive committedMonthlyUsd', async () => {
      await expect(svc.set('p1', { ...validInput, committedMonthlyUsd: 0 })).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `npx vitest run lib/services/meteredPricing.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `lib/services/meteredPricing.ts`:

```typescript
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { MeteredPricingRepository } from '@/lib/db/repositories/meteredPricing';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';

export const meteredPricingInputSchema = z
  .object({
    unitLabel: z.string().min(1).max(40),
    includedUnitsPerMonth: z.number().int().min(0),
    committedMonthlyUsd: z.number().positive(),
    overageRatePerUnitUsd: z.number().min(0),
    costPerUnitUsd: z.number().min(0),
  })
  .strict();

export type MeteredPricingInput = z.infer<typeof meteredPricingInputSchema>;

export class MeteredPricingService {
  private repo: MeteredPricingRepository;

  constructor(private prisma: PrismaClient) {
    this.repo = new MeteredPricingRepository(prisma);
  }

  async get(productId: string) {
    return this.repo.findByProductId(productId);
  }

  async set(productId: string, raw: unknown) {
    const input = meteredPricingInputSchema.parse(raw);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, kind: true, revenueModel: true },
    });
    if (!product) throw new NotFoundError('Product', productId);
    if (product.kind !== 'SAAS_USAGE') {
      throw new ValidationError('productId', 'metered pricing applies only to SAAS_USAGE products');
    }
    if (product.revenueModel !== 'METERED') {
      throw new ValidationError(
        'productId',
        'metered pricing requires revenueModel = METERED on the product',
      );
    }
    return this.repo.upsert(productId, input);
  }
}
```

- [ ] **Step 4: Run to pass**

Run: `npx vitest run lib/services/meteredPricing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/meteredPricing.ts lib/services/meteredPricing.test.ts
git commit -m "feat(phase-6): MeteredPricingService with Zod validation"
```

---

## Task 6-H: Product service — revenueModel invariants

**Files:**
- Modify: `lib/services/product.ts`
- Modify: `lib/services/product.test.ts`

- [ ] **Step 1: Read the current service**

Run: `grep -n "createProduct\|updateProduct" lib/services/product.ts | head -10` — note the shape of `createProduct` and `updateProduct`.

- [ ] **Step 2: Write failing tests (appended to existing)**

Append to `lib/services/product.test.ts`:

```typescript
describe('ProductService — revenueModel invariants (phase 6)', () => {
  let prisma: any;
  let svc: ProductService;

  beforeEach(() => {
    prisma = {
      product: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      listPrice: { findUnique: vi.fn().mockResolvedValue(null) },
      meteredPricing: { findUnique: vi.fn().mockResolvedValue(null) },
      scenarioSaaSConfig: { count: vi.fn().mockResolvedValue(0) },
    };
    svc = new ProductService(prisma);
  });

  it('createProduct — accepts revenueModel for SAAS_USAGE', async () => {
    prisma.product.create.mockResolvedValue({ id: 'p1', revenueModel: 'METERED' });
    await svc.createProduct({ name: 'Omni Concierge', kind: 'SAAS_USAGE', revenueModel: 'METERED' });
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revenueModel: 'METERED' }),
      }),
    );
  });

  it('createProduct — defaults revenueModel to PER_SEAT when omitted', async () => {
    prisma.product.create.mockResolvedValue({ id: 'p1' });
    await svc.createProduct({ name: 'X', kind: 'SAAS_USAGE' });
    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revenueModel: 'PER_SEAT' }),
      }),
    );
  });

  it('createProduct — rejects revenueModel METERED for non-SAAS kinds', async () => {
    await expect(
      svc.createProduct({ name: 'X', kind: 'PACKAGED_LABOR', revenueModel: 'METERED' as any }),
    ).rejects.toThrow(ValidationError);
  });

  it('updateProduct — rejects revenueModel change once MeteredPricing exists', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'p1',
      kind: 'SAAS_USAGE',
      revenueModel: 'METERED',
    });
    prisma.meteredPricing.findUnique.mockResolvedValue({ id: 'm1' });
    await expect(svc.updateProduct('p1', { revenueModel: 'PER_SEAT' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('updateProduct — rejects revenueModel change once ListPrice exists', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'p1',
      kind: 'SAAS_USAGE',
      revenueModel: 'PER_SEAT',
    });
    prisma.listPrice.findUnique.mockResolvedValue({ id: 'lp1' });
    await expect(svc.updateProduct('p1', { revenueModel: 'METERED' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('updateProduct — rejects revenueModel change once scenarios reference product', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'p1',
      kind: 'SAAS_USAGE',
      revenueModel: 'PER_SEAT',
    });
    prisma.scenarioSaaSConfig.count.mockResolvedValue(3);
    await expect(svc.updateProduct('p1', { revenueModel: 'METERED' })).rejects.toThrow(
      ValidationError,
    );
  });
});
```

- [ ] **Step 3: Run to fail**

Run: `npx vitest run lib/services/product.test.ts`
Expected: FAIL — `revenueModel` param not accepted / not validated.

- [ ] **Step 4: Implement**

In `lib/services/product.ts`:

1. Extend the Zod schema for `createProduct` input with:
   ```typescript
   revenueModel: z.enum(['PER_SEAT', 'METERED']).optional(),
   ```
2. In the `createProduct` body, after parsing input: if `kind !== 'SAAS_USAGE'` and `revenueModel === 'METERED'`, throw `new ValidationError('revenueModel', 'METERED only valid for SAAS_USAGE products')`. Default to `'PER_SEAT'` if not provided.
3. Pass `revenueModel` into the `prisma.product.create({ data: { ... }})` call.
4. Extend the `updateProduct` Zod schema with the same `revenueModel` field (optional).
5. In `updateProduct`, if the input contains `revenueModel` different from the current, run checks:
   ```typescript
   const [listPrice, meteredPricing, scenarioCount] = await Promise.all([
     this.prisma.listPrice.findUnique({ where: { productId: id } }),
     this.prisma.meteredPricing.findUnique({ where: { productId: id } }),
     this.prisma.scenarioSaaSConfig.count({ where: { productId: id } }),
   ]);
   if (listPrice || meteredPricing || scenarioCount > 0) {
     throw new ValidationError(
       'revenueModel',
       'cannot change revenueModel — product already has pricing or scenario references',
     );
   }
   ```

- [ ] **Step 5: Run to pass**

Run: `npx vitest run lib/services/product.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/services/product.ts lib/services/product.test.ts
git commit -m "feat(phase-6): product service enforces revenueModel invariants"
```

---

## Task 6-I: Service gates — per-seat mutations rejected on METERED

**Files:**
- Modify each of these services to check `product.revenueModel === 'METERED'` and throw `ValidationError` before any write:
  - `lib/services/listPrice.ts`
  - `lib/services/volumeDiscountTier.ts`
  - `lib/services/persona.ts`
  - `lib/services/otherVariable.ts`
  - `lib/services/baseUsage.ts`
  - `lib/services/vendorRate.ts`
  - `lib/services/productScale.ts`
- Modify each test file to cover the new rejection.
- Modify `lib/services/rail.ts` to reject `MAX_DISCOUNT_PCT` and `MIN_SEAT_PRICE` on METERED products.
- Modify `lib/services/rail.test.ts` to cover both rail kinds.

- [ ] **Step 1: Add the shared helper**

Append to `lib/services/product.ts` (or a new helper file `lib/services/_revenueModelGuard.ts`):

```typescript
export async function assertProductRevenueModel(
  prisma: PrismaClient,
  productId: string,
  expected: 'PER_SEAT' | 'METERED',
): Promise<void> {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, revenueModel: true, kind: true },
  });
  if (!p) throw new NotFoundError('Product', productId);
  if (p.kind !== 'SAAS_USAGE') return; // not applicable
  if (p.revenueModel !== expected) {
    throw new ValidationError(
      'revenueModel',
      `operation requires product revenueModel=${expected}, found ${p.revenueModel}`,
    );
  }
}
```

- [ ] **Step 2: Add the call in each per-seat-only service's write methods**

For each file listed above, at the top of any `create*`, `update*`, `delete*`, `set*` method that mutates a per-seat-only entity:

```typescript
await assertProductRevenueModel(this.prisma, productId, 'PER_SEAT');
```

(`this.prisma` may be a free `prisma` import — adapt to the file's style.)

- [ ] **Step 3: Update each service test file**

For each of the 7 services above, add ONE test:

```typescript
it('rejects mutation when product revenueModel is METERED', async () => {
  prisma.product.findUnique.mockResolvedValue({
    id: 'p1',
    kind: 'SAAS_USAGE',
    revenueModel: 'METERED',
  });
  await expect(svc.create({ productId: 'p1', /* minimal valid payload */ })).rejects.toThrow(
    /revenueModel/,
  );
});
```

Reuse the pattern across all 7 files. For each test, pick the service's simplest write method and a minimal valid payload shape from existing tests.

- [ ] **Step 4: Update rail service + test**

In `lib/services/rail.ts`, in the `create`/`update` method(s), after loading the product, if `product.revenueModel === 'METERED'` and `input.kind` is `'MAX_DISCOUNT_PCT'` or `'MIN_SEAT_PRICE'`:

```typescript
if (
  product.revenueModel === 'METERED' &&
  (input.kind === 'MAX_DISCOUNT_PCT' || input.kind === 'MIN_SEAT_PRICE')
) {
  throw new ValidationError(
    'kind',
    `rail kind ${input.kind} not applicable to METERED products`,
  );
}
```

Add two cases in `lib/services/rail.test.ts`:

```typescript
it.each(['MAX_DISCOUNT_PCT', 'MIN_SEAT_PRICE'] as const)(
  'rejects %s rail on METERED product',
  async (kind) => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'p1',
      revenueModel: 'METERED',
      kind: 'SAAS_USAGE',
    });
    await expect(
      svc.createRail({
        productId: 'p1',
        kind,
        marginBasis: 'CONTRIBUTION',
        softThreshold: 0.2,
        hardThreshold: 0.1,
      }),
    ).rejects.toThrow(ValidationError);
  },
);
```

- [ ] **Step 5: Run all service tests**

Run: `npx vitest run lib/services`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/services
git commit -m "feat(phase-6): per-seat service gates + rail-kind gates for METERED products"
```

---

## Task 6-J: Scenario config — accept metered fields

**Files:**
- Modify: `lib/services/scenario.ts`
- Modify: `lib/services/scenario.test.ts`

- [ ] **Step 1: Extend the scenario SaaS-config Zod schema**

In `lib/services/scenario.ts`, find the Zod schema used by `setScenarioSaaSConfig` (or similarly-named method). Add:

```typescript
committedUnitsPerMonth: z.number().int().min(0).optional(),
expectedActualUnitsPerMonth: z.number().int().min(0).optional(),
```

- [ ] **Step 2: Cross-field validation**

In the body of the `setScenarioSaaSConfig` method, after loading the product's `revenueModel`:

```typescript
if (product.revenueModel === 'METERED') {
  if (input.committedUnitsPerMonth == null || input.expectedActualUnitsPerMonth == null) {
    throw new ValidationError(
      'committedUnitsPerMonth',
      'METERED SaaS config requires committed + expected units',
    );
  }
} else {
  if (input.committedUnitsPerMonth != null || input.expectedActualUnitsPerMonth != null) {
    throw new ValidationError(
      'committedUnitsPerMonth',
      'committed/expected units only allowed for METERED products',
    );
  }
}
```

Pass the fields through to `prisma.scenarioSaaSConfig.upsert({ ..., create: { ..., committedUnitsPerMonth, expectedActualUnitsPerMonth }, update: { ..., committedUnitsPerMonth, expectedActualUnitsPerMonth } })`.

- [ ] **Step 3: Add tests in `scenario.test.ts`**

```typescript
describe('setScenarioSaaSConfig — metered fields (phase 6)', () => {
  // reuse existing prisma mock harness; ensure prisma.product.findUnique returns
  // the product under test with the expected revenueModel.

  it('requires committed + expected for METERED products', async () => {
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', revenueModel: 'METERED' });
    await expect(
      svc.setScenarioSaaSConfig('s1', { productId: 'p1', seats: 0, personaMix: [] }),
    ).rejects.toThrow(/METERED/);
  });

  it('rejects committed/expected on PER_SEAT products', async () => {
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', revenueModel: 'PER_SEAT' });
    await expect(
      svc.setScenarioSaaSConfig('s1', {
        productId: 'p1',
        seats: 10,
        personaMix: [],
        committedUnitsPerMonth: 1000,
        expectedActualUnitsPerMonth: 1000,
      }),
    ).rejects.toThrow(/only allowed for METERED/);
  });

  it('persists committed + expected for METERED products', async () => {
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', revenueModel: 'METERED' });
    await svc.setScenarioSaaSConfig('s1', {
      productId: 'p1',
      seats: 0,
      personaMix: [],
      committedUnitsPerMonth: 5000,
      expectedActualUnitsPerMonth: 6200,
    });
    expect(prisma.scenarioSaaSConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          committedUnitsPerMonth: 5000,
          expectedActualUnitsPerMonth: 6200,
        }),
      }),
    );
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/services/scenario.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/scenario.ts lib/services/scenario.test.ts
git commit -m "feat(phase-6): scenario SaaS config accepts + validates metered fields"
```

---

## Task 6-K: MCP tools — metered pricing

**Files:**
- Create: `lib/mcp/tools/catalog/meteredPricing.ts`
- Create: `lib/mcp/tools/catalog/meteredPricing.test.ts`
- Modify: `app/api/mcp/route.ts`
- Modify: `lib/mcp/tools/reads.ts` + test — include `meteredPricing` in `get_product` / `list_products` response shape.
- Modify: `lib/mcp/tools/scenarioWrites.ts` + test — accept `committedUnitsPerMonth` / `expectedActualUnitsPerMonth` in `set_scenario_saas_config`.

- [ ] **Step 1: Write the failing tests for the new tools**

Create `lib/mcp/tools/catalog/meteredPricing.test.ts` (follow the pattern in `lib/mcp/tools/catalog/product.test.ts`):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/db/client', () => ({ prisma: {} }));
vi.mock('@/lib/services/meteredPricing', () => ({
  MeteredPricingService: vi.fn(function (this: any) {
    this.get = vi.fn();
    this.set = vi.fn();
    return this;
  }),
}));

import { MeteredPricingService } from '@/lib/services/meteredPricing';
import { getMeteredPricingTool, setMeteredPricingTool } from './meteredPricing';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};
const salesCtx: McpContext = { ...adminCtx, user: { ...adminCtx.user, role: 'SALES' } };

describe('metered pricing MCP tools', () => {
  let svc: any;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new (MeteredPricingService as any)();
    (MeteredPricingService as any).mockImplementation(function (this: any) {
      Object.assign(this, svc);
      return this;
    });
  });

  it('set_metered_pricing is admin + isWrite', () => {
    expect(setMeteredPricingTool.requiresAdmin).toBe(true);
    expect(setMeteredPricingTool.isWrite).toBe(true);
    expect(setMeteredPricingTool.targetEntityType).toBe('MeteredPricing');
  });

  it('get_metered_pricing is readable by sales', () => {
    expect(getMeteredPricingTool.requiresAdmin).toBeFalsy();
    expect(getMeteredPricingTool.isWrite).toBeFalsy();
  });

  it('set_metered_pricing calls service.set', async () => {
    svc.set.mockResolvedValue({ id: 'm1' });
    const out = await setMeteredPricingTool.handler(adminCtx, {
      productId: 'p1',
      unitLabel: 'minute',
      includedUnitsPerMonth: 5000,
      committedMonthlyUsd: 2500,
      overageRatePerUnitUsd: 0.5,
      costPerUnitUsd: 0.2,
    });
    expect(svc.set).toHaveBeenCalledWith('p1', expect.objectContaining({ unitLabel: 'minute' }));
    expect(out).toEqual({ id: 'm1' });
  });

  it('get_metered_pricing returns pricing or null', async () => {
    svc.get.mockResolvedValue({ id: 'm1', unitLabel: 'minute' });
    const out = await getMeteredPricingTool.handler(salesCtx, { productId: 'p1' });
    expect(svc.get).toHaveBeenCalledWith('p1');
    expect(out).toEqual(expect.objectContaining({ id: 'm1' }));
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `npx vitest run lib/mcp/tools/catalog/meteredPricing.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the tools**

Create `lib/mcp/tools/catalog/meteredPricing.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { MeteredPricingService } from '@/lib/services/meteredPricing';

const setSchema = z
  .object({
    productId: z.string().min(1),
    unitLabel: z.string().min(1).max(40),
    includedUnitsPerMonth: z.number().int().min(0),
    committedMonthlyUsd: z.number().positive(),
    overageRatePerUnitUsd: z.number().min(0),
    costPerUnitUsd: z.number().min(0),
  })
  .strict();

export const setMeteredPricingTool: ToolDefinition<z.infer<typeof setSchema>, { id: string }> = {
  name: 'set_metered_pricing',
  description:
    'Admin only. Upserts the metered pricing row (committed fee, included units, overage rate, cost per unit) for a METERED SaaS product. Fails with ValidationError if the product is not SAAS_USAGE + METERED.',
  inputSchema: setSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'MeteredPricing',
  extractTargetId: (input) => (input as { productId: string }).productId,
  handler: async (_ctx, input) => {
    const svc = new MeteredPricingService(prisma);
    const { productId, ...rest } = input;
    const row = await svc.set(productId, rest);
    return { id: row.id };
  },
};

const getSchema = z.object({ productId: z.string().min(1) }).strict();

export const getMeteredPricingTool: ToolDefinition<z.infer<typeof getSchema>, unknown> = {
  name: 'get_metered_pricing',
  description:
    'Returns the MeteredPricing row for a SAAS_USAGE + METERED product, or null if not set. Read access for sales and admin.',
  inputSchema: getSchema,
  requiresAdmin: false,
  isWrite: false,
  handler: async (_ctx, input) => {
    const svc = new MeteredPricingService(prisma);
    return svc.get(input.productId);
  },
};

export const meteredPricingTools = [setMeteredPricingTool, getMeteredPricingTool];
```

- [ ] **Step 4: Register tools**

In `app/api/mcp/route.ts`, find the `tools` array (where Phase 5.2 tool arrays are spread). Add:

```typescript
import { meteredPricingTools } from '@/lib/mcp/tools/catalog/meteredPricing';
// ...
const tools = [
  // existing spreads
  ...meteredPricingTools,
];
```

- [ ] **Step 5: Update `get_product` / `list_products` reads**

In `lib/mcp/tools/reads.ts`, find the handler(s) returning product data. Extend the return shape to include `revenueModel` and `meteredPricing` (loaded via a service or repository call — keep tools free of Prisma; route through the existing product service pattern). Update `lib/mcp/tools/reads.test.ts` to cover both per-seat and metered products.

- [ ] **Step 6: Update `set_scenario_saas_config` MCP tool**

In `lib/mcp/tools/scenarioWrites.ts`, find the Zod schema for `set_scenario_saas_config`. Add:

```typescript
committedUnitsPerMonth: z.number().int().min(0).optional(),
expectedActualUnitsPerMonth: z.number().int().min(0).optional(),
```

Pass them through to the service call. Update `lib/mcp/tools/scenarioWrites.test.ts` with at least one metered case.

- [ ] **Step 7: Run tests**

```bash
npx vitest run lib/mcp
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/mcp app/api/mcp/route.ts
git commit -m "feat(phase-6): MCP tools — metered pricing + scenario metered fields"
```

---

## Task 6-L: Admin UI — product create page revenueModel dropdown

**Files:**
- Modify: `app/admin/products/new/page.tsx`
- Modify: `app/admin/products/new/page.test.tsx` if it exists (otherwise skip — rely on server action tests).

- [ ] **Step 1: Inspect current form**

Read `app/admin/products/new/page.tsx`. Identify how `name` and `kind` are submitted (likely a server action).

- [ ] **Step 2: Add the dropdown**

Below the `kind` select, add a conditional block that only renders when the selected `kind` is `SAAS_USAGE`:

```tsx
{kind === 'SAAS_USAGE' && (
  <div>
    <label htmlFor="revenueModel">Revenue model</label>
    <Select id="revenueModel" name="revenueModel" defaultValue="PER_SEAT">
      <option value="PER_SEAT">Per-seat</option>
      <option value="METERED">Metered</option>
    </Select>
  </div>
)}
```

(If the current file is a fully server-side form without reactive state, use a wrapper client component with `useState` for the `kind` selection — matching the codebase's established pattern for other admin forms with conditional fields.)

- [ ] **Step 3: Update the server action**

In the server action that handles the submit, pull `revenueModel` from the form data and pass to `ProductService.createProduct`.

- [ ] **Step 4: Manual smoke (dev)**

Start the app: `npm run dev`. Log in as admin, go to `/admin/products/new`, select `SAAS_USAGE` → dropdown appears. Select `METERED` → submit. Verify the new product's `revenueModel` in the DB or on the detail page.

- [ ] **Step 5: Commit**

```bash
git add app/admin/products/new
git commit -m "feat(phase-6): product create — revenueModel dropdown for SAAS_USAGE"
```

---

## Task 6-M: Admin UI — product detail conditional sections

**Files:**
- Modify: `app/admin/products/[id]/page.tsx`
- Create: `app/admin/products/[id]/metered-pricing/page.tsx`
- Create: `app/admin/products/[id]/metered-pricing/MeteredPricingForm.tsx` (client component)
- Create: `app/admin/products/[id]/metered-pricing/actions.ts` (server action)

- [ ] **Step 1: Hide per-seat-only sections when METERED**

In `app/admin/products/[id]/page.tsx`, fetch `product.revenueModel`. Wrap every section whose URL/link points to `base-usage`, `vendor-rates`, `personas`, `other-variable`, `list-price`, `volume-tiers`, or `scale` with:

```tsx
{product.revenueModel === 'PER_SEAT' && (
  <SectionLink href={...} />
)}
```

Keep Fixed Costs, Contract Modifiers, Labor SKUs (rolled up via bundles), and Rails visible for both.

- [ ] **Step 2: Add the Metered Pricing section link**

```tsx
{product.revenueModel === 'METERED' && (
  <SectionLink href={`/admin/products/${product.id}/metered-pricing`}>
    Metered Pricing
  </SectionLink>
)}
```

- [ ] **Step 3: Create the metered-pricing page**

Create `app/admin/products/[id]/metered-pricing/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { MeteredPricingService } from '@/lib/services/meteredPricing';
import { MeteredPricingForm } from './MeteredPricingForm';

export default async function MeteredPricingPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const product = await prisma.product.findUnique({ where: { id: params.id } });
  if (!product || product.revenueModel !== 'METERED') notFound();
  const svc = new MeteredPricingService(prisma);
  const pricing = await svc.get(params.id);
  return (
    <div>
      <h1>Metered Pricing — {product.name}</h1>
      <MeteredPricingForm productId={params.id} initial={pricing} />
    </div>
  );
}
```

- [ ] **Step 4: Create the form client component**

Create `app/admin/products/[id]/metered-pricing/MeteredPricingForm.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { setMeteredPricingAction } from './actions';

export function MeteredPricingForm({
  productId,
  initial,
}: {
  productId: string;
  initial: {
    unitLabel: string;
    includedUnitsPerMonth: number;
    committedMonthlyUsd: string | number;
    overageRatePerUnitUsd: string | number;
    costPerUnitUsd: string | number;
  } | null;
}) {
  const [state, setState] = useState({
    unitLabel: initial?.unitLabel ?? 'minute',
    includedUnitsPerMonth: initial?.includedUnitsPerMonth ?? 0,
    committedMonthlyUsd: Number(initial?.committedMonthlyUsd ?? 0),
    overageRatePerUnitUsd: Number(initial?.overageRatePerUnitUsd ?? 0),
    costPerUnitUsd: Number(initial?.costPerUnitUsd ?? 0),
  });

  return (
    <form
      action={async () => {
        await setMeteredPricingAction(productId, state);
      }}
    >
      <label>
        Unit label
        <input
          value={state.unitLabel}
          onChange={(e) => setState({ ...state, unitLabel: e.target.value })}
        />
      </label>
      <label>
        Included units / month
        <input
          type="number"
          value={state.includedUnitsPerMonth}
          onChange={(e) =>
            setState({ ...state, includedUnitsPerMonth: Number(e.target.value) })
          }
        />
      </label>
      <label>
        Committed monthly ($)
        <input
          type="number"
          step="0.01"
          value={state.committedMonthlyUsd}
          onChange={(e) => setState({ ...state, committedMonthlyUsd: Number(e.target.value) })}
        />
      </label>
      <label>
        Overage rate per unit ($)
        <input
          type="number"
          step="0.000001"
          value={state.overageRatePerUnitUsd}
          onChange={(e) => setState({ ...state, overageRatePerUnitUsd: Number(e.target.value) })}
        />
      </label>
      <label>
        Cost per unit ($)
        <input
          type="number"
          step="0.000001"
          value={state.costPerUnitUsd}
          onChange={(e) => setState({ ...state, costPerUnitUsd: Number(e.target.value) })}
        />
      </label>
      <button type="submit">Save</button>
    </form>
  );
}
```

(Inputs should use the existing design-system components — substitute `Input`, `Button`, `Label` from `@/components/ui/*` to match other admin forms.)

- [ ] **Step 5: Create the server action**

Create `app/admin/products/[id]/metered-pricing/actions.ts`:

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { MeteredPricingService } from '@/lib/services/meteredPricing';

export async function setMeteredPricingAction(
  productId: string,
  data: {
    unitLabel: string;
    includedUnitsPerMonth: number;
    committedMonthlyUsd: number;
    overageRatePerUnitUsd: number;
    costPerUnitUsd: number;
  },
) {
  await requireAdmin();
  const svc = new MeteredPricingService(prisma);
  await svc.set(productId, data);
  revalidatePath(`/admin/products/${productId}/metered-pricing`);
}
```

- [ ] **Step 6: Manual smoke (dev)**

Create a METERED product via the new-product flow. Navigate to its detail page → confirm per-seat sections hidden, Metered Pricing link visible. Click through, enter values, save, refresh → confirm persisted.

- [ ] **Step 7: Commit**

```bash
git add app/admin/products/\[id\]
git commit -m "feat(phase-6): admin product detail — conditional sections + metered pricing form"
```

---

## Task 6-N: Admin UI — rail editor filters kinds for METERED

**Files:**
- Modify: `app/admin/products/[id]/rails/*` (inspect to find the rail-kind dropdown).

- [ ] **Step 1: Find the rail-kind select**

Run: `grep -rn "MIN_MARGIN_PCT\|MAX_DISCOUNT_PCT" app/admin/products/\[id\]/rails/ 2>/dev/null`

- [ ] **Step 2: Filter the options**

In the rail-create component, if `product.revenueModel === 'METERED'`, show only `MIN_MARGIN_PCT` and `MIN_CONTRACT_MONTHS`. For PER_SEAT, show all four (current behavior).

- [ ] **Step 3: Manual smoke**

On a METERED product rails page, confirm only the two applicable kinds appear.

- [ ] **Step 4: Commit**

```bash
git add app/admin/products/\[id\]/rails
git commit -m "feat(phase-6): admin rail editor filters kinds for METERED products"
```

---

## Task 6-O: Sales UI — metered SaaS scenario tab

**Files:**
- Modify: `app/scenarios/[id]/page.tsx` — choose tab component per product.
- Create: `app/scenarios/[id]/metered/page.tsx` (new route segment) OR add a `MeteredTab.tsx` component alongside `notes/page.tsx` — follow whatever pattern the existing Notes tab uses.

- [ ] **Step 1: Inspect scenario builder tab routing**

Run: `ls app/scenarios/\[id\]/` and read `app/scenarios/[id]/notes/page.tsx` to understand how per-product tabs are registered / linked.

- [ ] **Step 2: Decide the tab route**

Notes is hardcoded in the file structure. For Omni Concierge (METERED), either:
  - Add a new route segment `app/scenarios/[id]/metered/[productId]/page.tsx`, OR
  - Generalize the notes tab to accept any `SAAS_USAGE` product and branch internally on `revenueModel`.

**Chosen approach:** keep the existing `notes/` route for Ninja Notes unchanged (it's a hardcoded singleton today). Add a new parallel route `app/scenarios/[id]/metered/[productId]/page.tsx` for METERED products. This avoids touching the working Notes tab; the layout's left-nav picks the correct route per product based on `revenueModel`.

- [ ] **Step 3: Build the metered tab UI**

Render inputs for `committedUnitsPerMonth`, `expectedActualUnitsPerMonth`, and `contractMonths` (reading scenario-level contract months), plus a live summary box:

```tsx
<dl>
  <dt>Committed monthly</dt>
  <dd>{formatUsd(computeSummary.committedMonthlyAfterDiscount)}</dd>
  <dt>Overage</dt>
  <dd>
    {computeSummary.overageUnits} × {formatUsd(pricing.overageRatePerUnitUsd)} ={' '}
    {formatUsd(computeSummary.overageRevenue)}
  </dd>
  <dt>Total monthly revenue</dt>
  <dd>{formatUsd(computeSummary.monthlyRevenue)}</dd>
  <dt>Monthly cost</dt>
  <dd>{formatUsd(computeSummary.monthlyCost)}</dd>
  <dt>Monthly margin</dt>
  <dd>
    {formatUsd(computeSummary.monthlyMargin)} ({formatPct(computeSummary.monthlyMarginPct)})
  </dd>
  <dt>Contract total (revenue)</dt>
  <dd>{formatUsd(computeSummary.contractRevenue)}</dd>
</dl>
```

The summary is populated by calling the existing `/api/compute` endpoint (the same one the Notes tab debounces against) and reading the relevant `perTab` entry's `saasMeta.metered`.

- [ ] **Step 4: Wire the save action**

Submits `committedUnitsPerMonth` + `expectedActualUnitsPerMonth` to the existing `setScenarioSaaSConfig` service. Default `committedUnitsPerMonth` to `pricing.includedUnitsPerMonth`, `expectedActualUnitsPerMonth` to `committedUnitsPerMonth`.

- [ ] **Step 5: Manual smoke**

Create a scenario, add Omni Concierge. Enter 5000 committed / 6200 expected / 36-month contract. Confirm the summary matches the golden fixture values (committed after discount $2,250; overage $600; total $2,850; monthly cost depends on fixed costs).

- [ ] **Step 6: Commit**

```bash
git add app/scenarios/\[id\]
git commit -m "feat(phase-6): sales scenario builder — metered SaaS tab"
```

---

## Task 6-P: Quote PDF — metered line-item block

**Files:**
- Modify: `lib/pdf/customer.tsx`
- Modify: `lib/pdf/internal.tsx`
- Modify: `lib/pdf/customer.test.tsx`
- Modify: `lib/pdf/internal.test.tsx`

- [ ] **Step 1: Read existing PDF tests**

Read `lib/pdf/customer.test.tsx` to understand the test pattern (likely snapshot tests or text-content assertions).

- [ ] **Step 2: Add a metered branch in the customer PDF**

In `lib/pdf/customer.tsx`, find the per-SaaS-tab rendering block. Add:

```tsx
{tab.kind === 'SAAS_USAGE' && tab.saasMeta?.metered ? (
  <MeteredLineItem tab={tab} productName={...} contractMonths={...} />
) : (
  <PerSeatLineItem ... />
)}
```

And define `MeteredLineItem`:

```tsx
function MeteredLineItem({
  tab,
  productName,
  contractMonths,
  unitLabel,
}: {
  tab: TabResult;
  productName: string;
  contractMonths: number;
  unitLabel: string;
}) {
  const m = tab.saasMeta!.metered!;
  const committedAfterDiscount = m.committedMonthlyUsd.mul(d(1).minus(m.contractDiscountPct));
  return (
    <View>
      <Text>{productName} — {contractMonths}-month term</Text>
      <Text>Monthly base ({m.includedUnitsPerMonth} {unitLabel}s included)  {formatUsd(m.committedMonthlyUsd)}</Text>
      <Text>Overage rate  {formatUsd(m.overageRatePerUnitUsd)} / {unitLabel}</Text>
      {m.contractDiscountPct.gt(0) && (
        <Text>Contract discount ({contractMonths}-mo)  -{formatPct(m.contractDiscountPct)}</Text>
      )}
      <Text>Effective monthly base  {formatUsd(committedAfterDiscount)}</Text>
      <Text>Expected monthly total: {formatUsd(tab.monthlyRevenueCents / 100)}</Text>
      <Text>Contract total  {formatUsd(tab.contractRevenueCents / 100)}</Text>
    </View>
  );
}
```

Thread `unitLabel` from `product.meteredPricing.unitLabel` — the PDF builder already loads the product for the tab's `productId`, so this is an existing field on an existing load, not a new query.

- [ ] **Step 3: Mirror in internal PDF**

In `lib/pdf/internal.tsx`, add the cost columns: `costPerUnit`, monthly cost, monthly margin $ / %.

- [ ] **Step 4: Add tests**

In both PDF test files, add one metered-tab test asserting the rendered text contains the expected labels and numbers.

- [ ] **Step 5: Run tests**

Run: `npx vitest run lib/pdf`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/pdf
git commit -m "feat(phase-6): customer + internal PDF render metered line items"
```

---

## Task 6-Q: HubSpot catalog translator — metered products

**Files:**
- Modify: `lib/hubspot/catalog/translator.ts`
- Modify: `lib/hubspot/catalog/translator.test.ts`

- [ ] **Step 1: Read current translator**

Inspect `lib/hubspot/catalog/translator.ts` to understand how a `Product` is mapped to HubSpot's product payload. Note what `price`, `recurringbillingfrequency`, and custom properties get set.

- [ ] **Step 2: Add metered branch**

In the product translator, branch on `product.revenueModel`:

```typescript
if (product.revenueModel === 'METERED') {
  const mp = product.meteredPricing;
  if (!mp) throw new ValidationError('meteredPricing', 'METERED product missing pricing');
  return {
    // Main recurring product
    name: product.name,
    price: mp.committedMonthlyUsd.toString(),
    hs_recurring_billing_period: 'P1M',
    description: `Includes ${mp.includedUnitsPerMonth} ${mp.unitLabel}s / month`,
    // Custom HubSpot property — declared in hubspot-project app manifest if not already
    np_metered_unit_label: mp.unitLabel,
    np_included_units: mp.includedUnitsPerMonth,
    np_overage_rate: mp.overageRatePerUnitUsd.toString(),
  };
}
// existing per-seat return unchanged
```

(If linked companion products are used for overage — per the design spec — represent them as a second translator call keyed on a well-known suffix like `-overage`.)

- [ ] **Step 3: Add a translator test**

In `lib/hubspot/catalog/translator.test.ts`:

```typescript
it('translates a METERED product with recurring base price', () => {
  const p = buildMeteredProductFixture(); // helper matching existing per-seat fixtures
  const out = translateProductToHubspot(p);
  expect(out.price).toBe('2500');
  expect(out.hs_recurring_billing_period).toBe('P1M');
  expect(out.np_metered_unit_label).toBe('minute');
  expect(out.np_included_units).toBe(5000);
  expect(out.np_overage_rate).toBe('0.5');
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/hubspot/catalog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/hubspot/catalog
git commit -m "feat(phase-6): HubSpot catalog translator — METERED products"
```

---

## Task 6-R: HubSpot quote translator — metered line items

**Files:**
- Modify: `lib/hubspot/quote/translator.ts`
- Modify: `lib/hubspot/quote/translator.test.ts`

- [ ] **Step 1: Read current quote translator**

Inspect `lib/hubspot/quote/translator.ts` — confirm how each compute result tab maps to HubSpot line items.

- [ ] **Step 2: Branch on metered meta**

```typescript
if (tab.kind === 'SAAS_USAGE' && tab.saasMeta?.metered) {
  const m = tab.saasMeta.metered;
  const lineItems = [
    {
      name: `${productName} — Monthly base (${m.includedUnitsPerMonth} ${unitLabel}s included)`,
      quantity: contractMonths,
      price: m.committedMonthlyUsd.mul(d(1).minus(m.contractDiscountPct)).toString(),
      recurringbillingfrequency: 'monthly',
    },
  ];
  if (m.overageUnits > 0) {
    lineItems.push({
      name: `${productName} — Overage (${m.overageUnits} ${unitLabel}s/mo × ${contractMonths} mo)`,
      quantity: m.overageUnits * contractMonths,
      price: m.overageRatePerUnitUsd.toString(),
      recurringbillingfrequency: 'monthly',
    });
  }
  return lineItems;
}
// existing per-seat branch unchanged
```

- [ ] **Step 3: Add fixture test**

Add a case in `lib/hubspot/quote/translator.test.ts`:

```typescript
it('translates a METERED tab to recurring + overage line items', () => {
  const tab = buildMeteredTabResultFixture(); // includes saasMeta.metered
  const items = translateTabToHubspotLineItems(tab, { productName: 'Omni Concierge', ... });
  expect(items).toHaveLength(2);
  // recurring base
  expect(items[0].price).toBe('2250');
  expect(items[0].quantity).toBe(36);
  // overage
  expect(items[1].quantity).toBe(1200 * 36);
  expect(items[1].price).toBe('0.5');
});

it('omits overage line when overageUnits = 0', () => {
  const tab = buildMeteredTabResultFixture({ overageUnits: 0 });
  const items = translateTabToHubspotLineItems(tab, ...);
  expect(items).toHaveLength(1);
});
```

- [ ] **Step 4: Reconcile totals**

After the existing `publishQuoteToHubspot` flow, confirm the sum of line-item `quantity × price` matches the frozen `Quote.totals` snapshot. If a reconciliation assertion already exists in `publish.ts`, make sure the metered case is covered by a test.

- [ ] **Step 5: Run tests**

Run: `npx vitest run lib/hubspot/quote`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/hubspot/quote
git commit -m "feat(phase-6): HubSpot quote translator — METERED line items"
```

---

## Task 6-S: Seed Omni Sales + Omni Concierge

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Extend the seed array**

Find the `const products = [ ... { name: 'Ninja Notes', ... }, ... ]` block. Add:

```typescript
{
  name: 'Omni Sales',
  kind: ProductKind.SAAS_USAGE,
  revenueModel: 'PER_SEAT',
  sortOrder: 4,
  isActive: false,
},
{
  name: 'Omni Concierge',
  kind: ProductKind.SAAS_USAGE,
  revenueModel: 'METERED',
  sortOrder: 5,
  isActive: false,
},
```

- [ ] **Step 2: Seed a MeteredPricing template for Omni Concierge**

After the product upsert loop, if Omni Concierge was created (or already exists), upsert its metered pricing:

```typescript
const concierge = await prisma.product.findUnique({ where: { name: 'Omni Concierge' } });
if (concierge) {
  await prisma.meteredPricing.upsert({
    where: { productId: concierge.id },
    create: {
      productId: concierge.id,
      unitLabel: 'minute',
      includedUnitsPerMonth: 5000,
      committedMonthlyUsd: '2500',
      overageRatePerUnitUsd: '0.50',
      costPerUnitUsd: '0.20',
    },
    update: {},
  });
}
```

- [ ] **Step 3: Run the seed locally**

Run: `npx prisma db seed`
Expected: no errors. Query via Prisma Studio or `psql` that both Omni products exist and Concierge has a `MeteredPricing` row.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(phase-6): seed Omni Sales + Omni Concierge product shells"
```

---

## Task 6-T: Typecheck, lint, format, full test run

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Lint**

Run: `npx eslint . --ext .ts,.tsx`
Expected: no new warnings/errors. Fix any that crept in.

- [ ] **Step 3: Format**

Run: `npx prettier --write .`
Commit any resulting formatting changes:

```bash
git diff --stat
git add -A
git commit -m "chore(phase-6): prettier format" || true
```

- [ ] **Step 4: Full test suite**

Run: `npx vitest run`
Expected: all pass. Triage any regressions.

- [ ] **Step 5: Integration tests** (if configured)

Run: `npx vitest run --config vitest.integration.config.ts` (only if the project's integration suite is normally green in your env).

- [ ] **Step 6: Commit final fixes if any**

```bash
git status
git add -A
git commit -m "chore(phase-6): final cleanup after full run" || true
```

---

## Task 6-U: Update backlog + mark phase shipped

**Files:**
- Modify: `docs/superpowers/backlog.md`

- [ ] **Step 1: Remove the Phase 6 deferrals that are now shipped**

In `docs/superpowers/backlog.md`, delete the "Additional SaaS products (Omni, Concierge, Sales)" style entry if present (it was tracked in `v1 design` rather than explicitly in backlog — verify by reading the file). Leave untouched the entries for volume tiers on committed units, `MIN_MONTHLY_FEE` rail, multiple cost types — those are the items you want the *next* phase to pick up.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/backlog.md
git commit -m "docs(phase-6): backlog — mark Omni products + metered SaaS shipped"
```

---

## Self-review checklist (run before declaring the phase complete)

- [ ] All tests pass: engine, services, repositories, MCP, PDF, HubSpot translators.
- [ ] Prisma migration applies cleanly on a fresh DB.
- [ ] Seed produces Omni Sales (PER_SEAT) and Omni Concierge (METERED, with MeteredPricing row).
- [ ] Can create a METERED product via admin UI → per-seat sections hidden → metered pricing form saves.
- [ ] Can create a scenario with Omni Concierge → enter committed + expected → summary matches engine compute.
- [ ] Generate a quote → customer PDF shows metered line-item block; internal PDF includes cost columns.
- [ ] HubSpot catalog push on a METERED product emits recurring product with metered custom props.
- [ ] HubSpot quote publish emits recurring + overage line items that sum to the pricer's frozen totals.
- [ ] No regressions in per-seat (Ninja Notes) flows.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx eslint` clean.
- [ ] `npx prettier --check .` clean.
