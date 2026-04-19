# Ninja Pricer v1 — Phase 2: Admin UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin can fully configure the system — vendor rates, personas, pricing tiers, labor SKUs, departments, employees, burdens, commission rules, bundles, rails, and users — through a purpose-built `/admin` UI backed by a typed service + repository layer.

**Architecture:** The service layer (`lib/services/`) and repository layer (`lib/db/repositories/`) are built here and consumed by Next.js Server Actions in `app/admin/`. Each admin entity group gets a repository (thin Prisma wrapper) and a service (Zod validation + typed errors + repo calls). Admin pages use shadcn/ui components (installed in Phase 2.1) against a shared admin sidebar layout. Engine is pure and unchanged except for the intake fixes in Phase 2.0.

**Tech Stack:** TypeScript (strict), Next.js 14 app router, Prisma, Postgres, NextAuth v5, Zod, shadcn/ui + Tailwind, Vitest (unit/integration), decimal.js.

**Spec reference:** [docs/superpowers/specs/2026-04-17-ninja-pricer-v1-design.md](./2026-04-17-ninja-pricer-v1-design.md)

**Phase roadmap:** [docs/superpowers/plans/2026-04-17-ninja-pricer-v1-phases.md](../plans/2026-04-17-ninja-pricer-v1-phases.md)

**Phase 1 plan:** [docs/superpowers/plans/2026-04-17-ninja-pricer-v1-phase-1-foundation-and-engine.md](../plans/2026-04-17-ninja-pricer-v1-phase-1-foundation-and-engine.md)

---

## Conventions (inherited from Phase 1, restated for agentic workers)

- **TDD.** Write failing test → run → implement → run passing → commit.
- **One task = one commit** unless the task explicitly groups multiple commits.
- **Money in the engine:** all engine computations go through `decimal.js`. Final totals in integer cents. Never use `number` for money inside `lib/engine`.
- **Pure engine:** no Prisma imports, no Next.js imports, no `process.env` — engine receives everything as input. Phase 2.0 fixes the engine; subsequent sub-phases do not touch `lib/engine`.
- **Server Actions for mutations.** Every admin form write goes through a server action. No client-side fetches for writes.
- **Zod at the service boundary.** Services receive raw form data and validate with Zod before touching the DB.
- **Typed errors.** `lib/utils/errors.ts` types (`ValidationError`, `NotFoundError`, `RailHardBlockError`) are thrown by services and mapped to user-facing messages in server actions.
- **Repository pattern.** Repositories (`lib/db/repositories/`) are thin Prisma wrappers. Services orchestrate repos; server actions call services. Pages do not import Prisma directly.
- **Commit-message style:** conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `refactor:`, `docs:`).

---

## Goals

- All admin configuration data is enterable and editable through the UI.
- The service + repository layer is established and ready for Phase 3 (scenarios) and Phase 4 (quotes) to build on.
- Phase 1 engine defects and typing gaps are resolved before any new code depends on them.
- Role enforcement is airtight at the middleware level, not just the layout level.

## Non-Goals

- Sales UI, scenario creation, scenario builder — Phase 3.
- PDF generation, quote history — Phase 4.
- Computed loaded-rate display on the _sales_ side — Phase 3.
- MCP server, HubSpot, or Cowork integration — v2.
- Staging environment — v1 ships single production.
- Auto-costing labor SKUs from department rates — v2.
- Rate-card historical versioning — v2 (frozen totals in Quote rows are the audit trail for v1).

---

## Sub-phase Overview

| Sub-phase | Theme | Key output |
|-----------|-------|------------|
| 2.0 | Intake — Phase 1 follow-ups | Engine correctness + auth typing hardened |
| 2.1 | Admin foundation | shadcn, sidebar layout, repo/service scaffolding |
| 2.2 | Products domain | Full product + rate-card admin |
| 2.3 | Labor domain | SKUs, departments (with loaded rate), employees, burdens |
| 2.4 | Commissions + Bundles | Rules/tier editor, bundle builder |
| 2.5 | Users | User invite + role management |

**Sequencing rationale:**

Phase 2.0 runs first because the 7 important engine and auth issues are load-bearing: double-rounding in the engine could silently miscompute margin on every deal downstream, the missing scopeProductId validation silently produces $0 commissions, and the layout-only role guard leaves upcoming admin API routes unprotected. Fixing these before building on top avoids compounding the bugs.

Within the Admin UI, entity groups ship in dependency order: Products first (Phase 3 needs rates to run any scenario; Rails ship as a sub-section of each product's detail page per the design spec), Labor second (employees + burdens feed department loaded rates which feed commission and bundle editors), Commissions + Bundles third (reference both products and departments), Users last (standalone). No feature flag is needed — admin routes are already protected; each entity group is independently useful to an admin as soon as it ships.

shadcn/ui is installed in Phase 2.1 (not earlier) because the engine-and-auth fixes in 2.0 touch no UI.

---

## Phase 2.0 — Intake: Phase 1 Follow-ups

**Goal:** Close all 7 "important" Phase 1 review items and the 5 related minors before any new code depends on the affected modules. No new features; only correctness and typing hardening.

**Files touched (engine):**
- Modify: `lib/engine/saas-tab.ts` (double-rounding fix #1)
- Modify: `lib/engine/custom-labor-tab.ts` (double-rounding fix #1)
- Modify: `lib/engine/packaged-labor-tab.ts` (double-rounding fix #1)
- Modify: `lib/engine/types.ts` (add `saasMeta` to TabResult #3; add seatCount === 0 path #12)
- Modify: `lib/engine/rails.ts` (use typed `saasMeta.effectiveDiscountPct` #3; accept `contractMonths` param #5)
- Modify: `lib/engine/commissions.ts` (validate scopeProductId/scopeDepartmentId #2; log empty-tier warning #9)
- Modify: `lib/engine/saas-cost.ts` (throw on unknown vendorRateId #4)
- Modify: `lib/engine/saas-discount.ts` (clamp effectiveDiscount below 0 #8)
- Modify: `lib/engine/mix.ts` (use Decimal for percentage sum validation #10)
- Modify: `lib/engine/compute.ts` (plumb contractMonths to evaluateRails #5)
- Tests: `lib/engine/saas-tab.test.ts` (seatCount === 0 case #12)
- Tests: `lib/engine/commissions.test.ts` (scopeId missing cases #2)
- Tests: `lib/engine/saas-cost.test.ts` (unknown vendorRateId #4)
- Tests: `lib/engine/rails.test.ts` (effectiveDiscount clamp #8; contractMonths plumbed #5)

**Files touched (auth / middleware):**
- Modify: `auth.ts` (NextAuth module augmentation #6)
- Modify: `lib/auth/session.ts` (remove hand-casts #6)
- Modify: `components/TopNav.tsx` (remove hand-cast #6)
- Create: `middleware.ts` (role check at matcher level #7)
- Modify: `prisma/seed.ts` (document microsoftSub manual link step #11)
- Verify: `prisma/prisma.config.ts` or `package.json` (confirm dotenv dependency #13)

### Task 2.0-A: Fix double-rounding in contract aggregation (#1)

**Context:** `saas-tab.ts:27-29`, `custom-labor-tab.ts`, and `packaged-labor-tab.ts` each call `toCents()` to get a monthly integer, then multiply by `contractMonths` as an integer. This rounds twice. Fix: keep `Decimal` through the contract multiplication, call `toCents` once at the final contract boundary.

The fix follows the same pattern in all three tab files:

**Before (pattern in all three tab files):**
```typescript
const monthlyCostCents = toCents(monthlyCostDec);
// ...
contractCostCents: monthlyCostCents * contractMonths,
```

**After (pattern in all three tab files):**
```typescript
const contractCostDec = monthlyCostDec.mul(contractMonths);
// ...
monthlyCostCents: toCents(monthlyCostDec),
contractCostCents: toCents(contractCostDec),
```

Apply the same fix to `monthly_revenue → contract_revenue` and `contribution_margin` wherever they are multiplied by `contractMonths` after rounding.

- [ ] **Step 1: Write failing tests for double-rounding**

In `lib/engine/saas-tab.test.ts`, add a test that feeds 3 contract months and a price that produces a non-integer cent per month, then asserts that `contractCostCents === monthlyCostCents * 3` at Decimal precision (not rounded-then-tripled):

```typescript
it('avoids double-rounding on contract totals', () => {
  // 1 seat, $1.005/user/month variable cost, 3 months
  // Rounded monthly = 101 cents. Doubled-rounded contract = 303 cents.
  // True contract (Decimal) = 3.015 dollars = 302 cents (ROUND_HALF_UP from 301.5).
  const result = computeSaaSTab({
    productId: 'p1',
    seatCount: 1,
    personaMix: [{ personaId: 'avg', pct: 100 }],
    contractMonths: 3,
    rates: buildRates({ variablePerUserPerMonth: new Decimal('1.005') }),
  });
  expect(result.monthlyCostCents).toBe(101); // toCents(1.005) rounds to 101
  expect(result.contractCostCents).toBe(302); // toCents(3.015) = 302, not 101*3=303
});
```

Run: `npx vitest run lib/engine/saas-tab.test.ts`
Expected: FAIL

- [ ] **Step 2: Fix `lib/engine/saas-tab.ts`**

In `computeSaaSTab`, find every location that rounds to cents before multiplying by `contractMonths`. Replace with Decimal multiplication first, then `toCents` at the boundary. The final `SaaSTabResult` must contain both `monthlyCostCents` (from `toCents(monthlyCostDec)`) and `contractCostCents` (from `toCents(monthlyCostDec.mul(contractMonths))`).

- [ ] **Step 3: Repeat for `lib/engine/custom-labor-tab.ts` and `lib/engine/packaged-labor-tab.ts`**

These files compute `contractCostCents` for one-time labor (no monthly × N multiplication), so the main fix is confirming they already compute in Decimal before calling `toCents`. Inspect and add a comment confirming one-time totals have no double-rounding risk, or fix if they do.

- [ ] **Step 4: Run all engine tests**

```bash
npx vitest run lib/engine
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/saas-tab.ts lib/engine/custom-labor-tab.ts lib/engine/packaged-labor-tab.ts lib/engine/saas-tab.test.ts
git commit -m "fix(engine): avoid double-rounding on contract cost aggregation"
```

---

### Task 2.0-B: Validate scoped commission rules (#2, #9)

**Context:** `commissions.ts:45-51` silently returns $0 when a `TAB_REVENUE` or `TAB_MARGIN` rule is missing `scopeProductId`, and when a `DEPARTMENT`-scoped rule is missing `scopeDepartmentId`. Also, `compute.ts` silently filters commission rules with empty tiers without logging.

- [ ] **Step 1: Write failing tests**

In `lib/engine/commissions.test.ts`:

```typescript
it('throws ValidationError when TAB_REVENUE rule has no scopeProductId', () => {
  expect(() =>
    evaluateCommissions({
      rules: [
        {
          rule: { id: 'r1', scopeType: 'PRODUCT', baseMetric: 'TAB_REVENUE', scopeProductId: null, scopeDepartmentId: null },
          tiers: [{ thresholdFromUsd: 0, ratePct: new Decimal('10') }],
        },
      ],
      totals: buildTotals(),
      tabResults: [],
    })
  ).toThrow(ValidationError);
});

it('throws ValidationError when DEPARTMENT rule has no scopeDepartmentId', () => {
  expect(() =>
    evaluateCommissions({
      rules: [
        {
          rule: { id: 'r1', scopeType: 'DEPARTMENT', baseMetric: 'TAB_MARGIN', scopeProductId: null, scopeDepartmentId: null },
          tiers: [{ thresholdFromUsd: 0, ratePct: new Decimal('10') }],
        },
      ],
      totals: buildTotals(),
      tabResults: [],
    })
  ).toThrow(ValidationError);
});
```

Run: `npx vitest run lib/engine/commissions.test.ts`
Expected: FAIL (currently returns $0 silently).

- [ ] **Step 2: Fix `lib/engine/commissions.ts`**

Before computing the base amount for a rule, add guards:

```typescript
if (
  (rule.baseMetric === 'TAB_REVENUE' || rule.baseMetric === 'TAB_MARGIN') &&
  !ruleInput.rule.scopeProductId
) {
  throw new ValidationError(
    `Commission rule "${rule.id}" uses TAB_REVENUE/TAB_MARGIN but has no scopeProductId`
  );
}
if (rule.scopeType === 'DEPARTMENT' && !ruleInput.rule.scopeDepartmentId) {
  throw new ValidationError(
    `Commission rule "${rule.id}" is DEPARTMENT-scoped but has no scopeDepartmentId`
  );
}
```

- [ ] **Step 3: Add empty-tier log warning in `compute.ts`**

Find where commission rules with empty tiers are filtered. Replace the silent filter with a logger call:

```typescript
const rulesWithTiers = commissionRules.filter((r) => {
  if (r.tiers.length === 0) {
    logger.warn('Commission rule has no tiers and will be skipped', { ruleId: r.rule.id });
    return false;
  }
  return true;
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run lib/engine/commissions.test.ts lib/engine/compute.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/commissions.ts lib/engine/commissions.test.ts lib/engine/compute.ts
git commit -m "fix(engine): throw ValidationError on scoped commission rules missing scope id; log empty-tier rules"
```

---

### Task 2.0-C: Typed `saasMeta` on TabResult; fix rails stringly-typed coupling (#3, #5, #8)

**Context:** `rails.ts:61-66` reads `TabResult.breakdown.effectiveDiscount` as a string. Fix: add `saasMeta?: { effectiveDiscountPct: Decimal }` to `TabResult` so the rails contract is explicit. While in rails: plumb `contractMonths` directly instead of dividing costs to derive it. While in saas-discount: clamp `effectiveDiscount` below 0.

- [ ] **Step 1: Write failing test for negative discount clamp**

In `lib/engine/saas-discount.test.ts`:

```typescript
it('clamps effectiveDiscount to 0 when discountOverridePct is negative', () => {
  const result = computeEffectiveDiscount({
    seatCount: 10,
    contractMonths: 12,
    discountOverridePct: new Decimal('-5'),
    volumeTiers: [],
    contractModifiers: [],
  });
  expect(result.effectiveDiscountPct.equals(0)).toBe(true);
});
```

Run: `npx vitest run lib/engine/saas-discount.test.ts`
Expected: FAIL.

- [ ] **Step 2: Fix `lib/engine/saas-discount.ts`**

After computing `effectiveDiscountPct`, add lower bound:

```typescript
const clamped = Decimal.max(new Decimal(0), Decimal.min(new Decimal(1), effectiveDiscountPct));
return { effectiveDiscountPct: clamped };
```

- [ ] **Step 3: Add `saasMeta` to `TabResult` in `lib/engine/types.ts`**

```typescript
export interface SaaSMeta {
  effectiveDiscountPct: Decimal;
}

export interface TabResult {
  tabId: string;
  monthlyCostCents: number;
  monthlyRevenueCents: number;
  oneTimeCostCents: number;
  oneTimeRevenueCents: number;
  contractCostCents: number;
  contractRevenueCents: number;
  contributionMarginCents: number;
  saasMeta?: SaaSMeta; // populated for SAAS_USAGE tabs only
}
```

- [ ] **Step 4: Populate `saasMeta` in `lib/engine/saas-tab.ts`**

In `computeSaaSTab`, return `saasMeta: { effectiveDiscountPct: discount.effectiveDiscountPct }` in the result.

- [ ] **Step 5: Update `lib/engine/rails.ts` to use `saasMeta` and accept `contractMonths`**

Change the `evaluateRails` signature to accept `contractMonths: number` directly (not derive it from costs). Replace the string read from `breakdown.effectiveDiscount` with `tabResult.saasMeta?.effectiveDiscountPct`. Update all callers in `compute.ts`.

- [ ] **Step 6: Run all engine tests**

```bash
npx vitest run lib/engine
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add lib/engine/types.ts lib/engine/saas-tab.ts lib/engine/saas-discount.ts lib/engine/saas-discount.test.ts lib/engine/rails.ts lib/engine/compute.ts
git commit -m "fix(engine): typed saasMeta on TabResult; clamp discount >= 0; plumb contractMonths to evaluateRails"
```

---

### Task 2.0-D: Throw on unknown vendorRateId; Decimal mix validation; seatCount=0 test (#4, #10, #12)

- [ ] **Step 1: Write failing test for unknown vendorRateId**

In `lib/engine/saas-cost.test.ts`:

```typescript
it('throws ValidationError when baseUsage references an unknown vendorRateId', () => {
  expect(() =>
    computeBaseVariablePerUser({
      baseUsages: [{ vendorRateId: 'ghost-id', usagePerUserPerMonth: new Decimal('100') }],
      vendorRates: [], // ghost-id not present
      otherVariablePerUser: new Decimal('0'),
    })
  ).toThrow(ValidationError);
});
```

Run: `npx vitest run lib/engine/saas-cost.test.ts`
Expected: FAIL (currently skips silently).

- [ ] **Step 2: Fix `lib/engine/saas-cost.ts`**

```typescript
for (const usage of baseUsages) {
  const rate = vendorRates.find((r) => r.id === usage.vendorRateId);
  if (!rate) {
    throw new ValidationError(`Unknown vendorRateId in baseUsage: ${usage.vendorRateId}`);
  }
  // ... rest of calculation
}
```

- [ ] **Step 3: Fix Decimal consistency in `lib/engine/mix.ts`**

Find the `Math.abs(total - 100) > 0.001` check and replace with Decimal arithmetic:

```typescript
import { d } from '../utils/money';

const totalPct = mix.reduce((acc, m) => acc.plus(d(m.pct)), d(0));
if (!totalPct.equals(d(100))) {
  throw new ValidationError(`Persona mix must sum to 100, got ${totalPct.toFixed(3)}`);
}
```

Note: use `.equals(d(100))` only if pcts are always integers (which they should be per the schema). If fractional pcts are valid, use `totalPct.minus(100).abs().gt(d('0.001'))` as the check, but keep it Decimal.

- [ ] **Step 4: Add seatCount === 0 test**

In `lib/engine/saas-tab.test.ts`:

```typescript
it('returns all-zero result when seatCount is 0', () => {
  const result = computeSaaSTab({
    productId: 'p1',
    seatCount: 0,
    personaMix: [{ personaId: 'avg', pct: 100 }],
    contractMonths: 12,
    rates: buildDefaultRates(),
  });
  expect(result.monthlyCostCents).toBe(0);
  expect(result.monthlyRevenueCents).toBe(0);
  expect(result.contractCostCents).toBe(0);
});
```

Run: `npx vitest run lib/engine`
Expected: FAIL on the new tests.

- [ ] **Step 5: Verify seatCount === 0 already handled or fix**

Read `saas-tab.ts`. The spec notes `seatCount < 0` is guarded; zero should produce zeros naturally from multiplication. If the test passes after the fix above (because multiplication by 0 returns 0), no code change needed — the test just makes the existing guarantee explicit.

- [ ] **Step 6: Run all tests**

```bash
npx vitest run lib/engine
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add lib/engine/saas-cost.ts lib/engine/saas-cost.test.ts lib/engine/mix.ts lib/engine/saas-tab.test.ts
git commit -m "fix(engine): throw on unknown vendorRateId; Decimal pct-sum in mix; test seatCount=0"
```

---

### Task 2.0-E: NextAuth module augmentation for role typing (#6)

**Context:** `auth.ts`, `lib/auth/session.ts`, and `components/TopNav.tsx` all cast `session.user as { role?: string }`. Replace with a `declare module 'next-auth'` augmentation so `role` is typed end-to-end.

- [ ] **Step 1: Add module augmentation to `auth.ts`**

Add at the top of `auth.ts` (or a co-located `auth.d.ts`):

```typescript
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: 'ADMIN' | 'SALES';
    };
  }
  interface User {
    role: 'ADMIN' | 'SALES';
  }
}
```

- [ ] **Step 2: Remove hand-casts from `lib/auth/session.ts`**

Replace `(session.user as { role?: string }).role` with `session.user.role`. The augmentation makes `role` a first-class property. Update `AuthedUser` interface if it duplicates the session type.

- [ ] **Step 3: Remove hand-cast from `components/TopNav.tsx`**

Same: access `session.user.role` directly.

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add auth.ts lib/auth/session.ts components/TopNav.tsx
git commit -m "fix(auth): NextAuth module augmentation for typed role; remove hand-casts"
```

---

### Task 2.0-F: Middleware-level admin role check (#7)

**Context:** Role enforcement currently lives only in `app/admin/layout.tsx` via `requireAdmin()`. Future `/admin/api/*` or `/admin/*/route.ts` routes added in Phase 2 won't be under that layout and will be unguarded. Enforce the ADMIN role in Next.js middleware so all `/admin/*` paths are protected at the matcher level.

- [ ] **Step 1: Write a test confirming middleware behavior**

Create `tests/middleware.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
// Middleware unit testing strategy: test the role-check logic in isolation.
// The actual Next.js middleware function is tested via Playwright in Phase 3.
// Here we test the helper that middleware delegates to.
import { isAdminPath, userHasAdminRole } from '../lib/auth/middleware-helpers';

describe('isAdminPath', () => {
  it('matches /admin and all sub-paths', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/products')).toBe(true);
    expect(isAdminPath('/admin/users')).toBe(true);
    expect(isAdminPath('/scenarios')).toBe(false);
  });
});

describe('userHasAdminRole', () => {
  it('returns true only for ADMIN role', () => {
    expect(userHasAdminRole({ role: 'ADMIN' })).toBe(true);
    expect(userHasAdminRole({ role: 'SALES' })).toBe(false);
    expect(userHasAdminRole(null)).toBe(false);
  });
});
```

Run: `npx vitest run tests/middleware.test.ts`
Expected: FAIL (helpers not created yet).

- [ ] **Step 2: Create `lib/auth/middleware-helpers.ts`**

```typescript
export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function userHasAdminRole(user: { role: string } | null): boolean {
  return user?.role === 'ADMIN';
}
```

- [ ] **Step 3: Create `middleware.ts` at the project root**

```typescript
import { auth } from './auth';
import { isAdminPath, userHasAdminRole } from './lib/auth/middleware-helpers';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user ?? null;

  if (isAdminPath(pathname) && !userHasAdminRole(user)) {
    const url = req.nextUrl.clone();
    url.pathname = user ? '/scenarios' : '/api/auth/signin';
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ['/admin/:path*'],
};
```

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/middleware.test.ts
```

Expected: PASS.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add middleware.ts lib/auth/middleware-helpers.ts lib/auth/middleware-helpers.test.ts tests/middleware.test.ts
git commit -m "feat(auth): middleware-level admin role check on /admin/* routes"
```

---

### Task 2.0-G: Dotenv dependency check; seed microsoftSub doc (#11, #13)

- [ ] **Step 1: Verify dotenv in devDependencies**

```bash
cat package.json | grep dotenv
```

If `dotenv` does not appear in `devDependencies`, install it:

```bash
npm install --save-dev dotenv
```

If it appears only as a transitive dep, add it explicitly to `devDependencies` in `package.json` to prevent CI breakage if Prisma's transitive resolution changes.

- [ ] **Step 2: Document microsoftSub in `prisma/seed.ts`**

Locate where the seed creates a `User` record without `microsoftSub`. Add a comment:

```typescript
// microsoftSub is left null here. When this admin user signs in via Microsoft Entra for
// the first time, the NextAuth Prisma adapter will create an Account row and call the
// signIn callback, which should update microsoftSub. If the user gets duplicate Account
// rows, check that the adapter's linkAccount hook is setting microsoftSub on the User.
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json prisma/seed.ts
git commit -m "chore: confirm dotenv in devDeps; document microsoftSub seed gap"
```

---

### Phase 2.0 completion check

```bash
npx vitest run
npx tsc --noEmit
npx eslint . --max-warnings 0
```

All three must pass clean before moving to Phase 2.1.

---

## Phase 2.1 — Admin Foundation

**Goal:** Install UI component library, establish the admin shell (sidebar layout, nav), scaffold the repository and service patterns that every subsequent entity group follows.

### File map

```
lib/
  db/
    repositories/
      index.ts              (barrel — re-exports all repos)
  services/
    index.ts                (barrel — re-exports all services)
  auth/
    middleware-helpers.ts   (created in 2.0-F)

app/
  admin/
    layout.tsx              (sidebar shell — replaces placeholder)
    page.tsx                (dashboard redirect to /admin/products)

components/
  admin/
    AdminSidebar.tsx        (nav links; active-link highlighting)
    AdminShell.tsx          (sidebar + content layout wrapper)
  ui/                       (shadcn-generated components live here)
```

### Task 2.1-A: Install shadcn/ui

shadcn/ui is the right choice here: it gives accessible Radix-based form primitives (Input, Select, Dialog, Table, Label, Button) that the 8+ admin entity groups all need. Vanilla Tailwind alone would mean hand-rolling accessible comboboxes and modals.

- [ ] **Step 1: Run shadcn init**

```bash
npx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes
- `components.json` will be created at project root.

- [ ] **Step 2: Add the core components needed across admin**

```bash
npx shadcn@latest add button input label select textarea table dialog form badge
```

This generates `components/ui/*.tsx` files. Do not edit generated files — extend them with wrappers if needed.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add components/ui components.json tailwind.config.ts app/globals.css
git commit -m "chore: install shadcn/ui with core admin components"
```

---

### Task 2.1-B: Admin sidebar layout

- [ ] **Step 1: Write a render test for AdminSidebar**

Create `components/admin/AdminSidebar.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import AdminSidebar from './AdminSidebar';

const NAV_LINKS = [
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/labor-skus', label: 'Labor SKUs' },
  { href: '/admin/departments', label: 'Departments' },
  { href: '/admin/employees', label: 'Employees' },
  { href: '/admin/burdens', label: 'Burdens' },
  { href: '/admin/commissions', label: 'Commissions' },
  { href: '/admin/bundles', label: 'Bundles' },
  { href: '/admin/users', label: 'Users' },
];

it('renders all admin nav links', () => {
  render(<AdminSidebar currentPath="/admin/products" />);
  NAV_LINKS.forEach(({ label }) => {
    expect(screen.getByText(label)).toBeTruthy();
  });
});

it('marks the current path as active', () => {
  render(<AdminSidebar currentPath="/admin/products" />);
  const productsLink = screen.getByText('Products').closest('a');
  expect(productsLink?.getAttribute('aria-current')).toBe('page');
});
```

Run: `npx vitest run components/admin/AdminSidebar.test.tsx`
Expected: FAIL (component doesn't exist yet).

- [ ] **Step 2: Create `components/admin/AdminSidebar.tsx`**

```tsx
import Link from 'next/link';

const NAV = [
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/labor-skus', label: 'Labor SKUs' },
  { href: '/admin/departments', label: 'Departments' },
  { href: '/admin/employees', label: 'Employees' },
  { href: '/admin/burdens', label: 'Burdens' },
  { href: '/admin/commissions', label: 'Commissions' },
  { href: '/admin/bundles', label: 'Bundles' },
  { href: '/admin/users', label: 'Users' },
] as const;

// Note: Rails are per-product, accessed via /admin/products/[id]/rails — not a top-level nav item.

export default function AdminSidebar({ currentPath }: { currentPath: string }) {
  return (
    <nav className="w-56 shrink-0 border-r bg-slate-50 p-4 space-y-1">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Admin
      </p>
      {NAV.map(({ href, label }) => {
        const active = currentPath === href || currentPath.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`block rounded px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Create `components/admin/AdminShell.tsx`**

```tsx
import AdminSidebar from './AdminSidebar';

export default function AdminShell({
  children,
  currentPath,
}: {
  children: React.ReactNode;
  currentPath: string;
}) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <AdminSidebar currentPath={currentPath} />
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Update `app/admin/layout.tsx`**

```tsx
import { headers } from 'next/headers';
import TopNav from '@/components/TopNav';
import AdminShell from '@/components/admin/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const headersList = headers();
  const pathname = headersList.get('x-pathname') ?? '/admin';
  return (
    <>
      <TopNav />
      <AdminShell currentPath={pathname}>{children}</AdminShell>
    </>
  );
}
```

Note: Next.js 14 doesn't expose `pathname` server-side without a custom header or middleware. Add `x-pathname` injection to `middleware.ts`:

```typescript
// In middleware.ts, before the redirect check:
const requestHeaders = new Headers(req.headers);
requestHeaders.set('x-pathname', req.nextUrl.pathname);
const response = NextResponse.next({ request: { headers: requestHeaders } });
// ... rest of middleware
```

- [ ] **Step 5: Update `app/admin/page.tsx`** to redirect to `/admin/products`:

```tsx
import { redirect } from 'next/navigation';
export default function AdminPage() {
  redirect('/admin/products');
}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run components/admin
npx tsc --noEmit
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add app/admin/layout.tsx app/admin/page.tsx components/admin/ middleware.ts
git commit -m "feat(admin): sidebar layout shell with all section nav links"
```

---

### Task 2.1-C: Scaffold repository and service patterns

Establish the base pattern once; every subsequent entity group follows it exactly.

- [ ] **Step 1: Create `lib/db/repositories/index.ts`** (barrel, starts empty):

```typescript
// Repositories are imported here as they are created in Phases 2.2–2.5.
```

- [ ] **Step 2: Create `lib/services/index.ts`** (barrel, starts empty):

```typescript
// Services are imported here as they are created in Phases 2.2–2.5.
```

- [ ] **Step 3: Document the repository contract in a comment at the top of `lib/db/repositories/index.ts`**:

```typescript
// Repository contract:
// - Repositories are thin Prisma wrappers. They do not validate business rules.
// - All methods accept plain typed arguments and return Prisma model types or plain objects.
// - Repositories throw Prisma errors directly; services catch and re-throw as typed errors.
// - Services (not repositories) handle transactions when multiple repos must be called together.
```

- [ ] **Step 4: Commit**

```bash
git add lib/db/repositories/index.ts lib/services/index.ts
git commit -m "chore: scaffold repository and service barrel files"
```

---

## Phase 2.2 — Products Domain

**Goal:** Admin can create, view, and edit Products and all associated rate-card data: vendor rates, base usage, other variable, personas, fixed costs, active-user scale, list price, volume discount tiers, and contract length modifiers.

**Why Products first:** Phase 3 (sales scenarios) requires products and their rate cards to run any computation. Shipping this first enables Phase 3 work to start without blocking on Phase 2 being fully complete.

### File map

```
lib/
  db/
    repositories/
      product.ts
      vendor-rate.ts
      persona.ts
      product-fixed-cost.ts
      product-scale.ts
      list-price.ts
      volume-discount-tier.ts
      contract-length-modifier.ts
      rail.ts                      (Rails are per-product; repo + service live here with Products domain)
  services/
    product.ts
    rail.ts                        (validates threshold ordering per rail kind)

app/
  admin/
    products/
      page.tsx                     (products index list)
      new/
        page.tsx                   (create product form)
      [id]/
        page.tsx                   (product overview — links to sub-sections)
        vendor-rates/
          page.tsx                 (list + add vendor rates)
        base-usage/
          page.tsx                 (list + edit base usage per vendor rate)
        other-variable/
          page.tsx                 (edit other variable cost)
        personas/
          page.tsx                 (list + add personas)
        fixed-costs/
          page.tsx                 (list + add fixed cost line items)
        scale/
          page.tsx                 (edit active-user count)
        list-price/
          page.tsx                 (edit list price + add discount tiers + contract modifiers)
        rails/
          page.tsx                 (per-product rails — soft/hard thresholds, enable/disable)
          actions.ts

components/
  admin/
    products/
      ProductForm.tsx
      VendorRateForm.tsx
      PersonaForm.tsx
      FixedCostForm.tsx
      DiscountTierForm.tsx
      ContractModifierForm.tsx
```

### Task 2.2-A: Product repository and service

- [ ] **Step 1: Write failing tests for ProductRepository**

Create `lib/db/repositories/product.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ProductRepository } from './product';

// Integration test — requires a test database.
// Run: DATABASE_URL=<test-db-url> npx vitest run lib/db/repositories/product.test.ts

const prisma = new PrismaClient();
const repo = new ProductRepository(prisma);

beforeEach(async () => {
  await prisma.product.deleteMany();
});

describe('ProductRepository', () => {
  it('creates a product and finds it by id', async () => {
    const created = await repo.create({
      name: 'Ninja Notes',
      kind: 'SAAS_USAGE',
      isActive: true,
    });
    const found = await repo.findById(created.id);
    expect(found?.name).toBe('Ninja Notes');
    expect(found?.kind).toBe('SAAS_USAGE');
  });

  it('lists all active products', async () => {
    await repo.create({ name: 'Active', kind: 'SAAS_USAGE', isActive: true });
    await repo.create({ name: 'Inactive', kind: 'PACKAGED_LABOR', isActive: false });
    const active = await repo.listActive();
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('Active');
  });

  it('updates a product name', async () => {
    const p = await repo.create({ name: 'Old', kind: 'CUSTOM_LABOR', isActive: true });
    const updated = await repo.update(p.id, { name: 'New' });
    expect(updated.name).toBe('New');
  });

  it('throws when findById returns null for unknown id', async () => {
    const found = await repo.findById('nonexistent-id');
    expect(found).toBeNull();
  });
});
```

Run: `npx vitest run lib/db/repositories/product.test.ts`
Expected: FAIL (ProductRepository not created yet).

- [ ] **Step 2: Create `lib/db/repositories/product.ts`**

```typescript
import type { PrismaClient, Product, ProductKind } from '@prisma/client';

export class ProductRepository {
  constructor(private db: PrismaClient) {}

  async create(data: { name: string; kind: ProductKind; isActive: boolean }): Promise<Product> {
    return this.db.product.create({ data });
  }

  async findById(id: string): Promise<Product | null> {
    return this.db.product.findUnique({ where: { id } });
  }

  async listActive(): Promise<Product[]> {
    return this.db.product.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  async listAll(): Promise<Product[]> {
    return this.db.product.findMany({ orderBy: { name: 'asc' } });
  }

  async update(id: string, data: Partial<{ name: string; isActive: boolean }>): Promise<Product> {
    return this.db.product.update({ where: { id }, data });
  }
}
```

- [ ] **Step 3: Write failing tests for ProductService**

Create `lib/services/product.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ProductService } from './product';
import { ValidationError } from '../utils/errors';
import { mockProductRepo } from '../db/repositories/__mocks__/product';

describe('ProductService', () => {
  it('throws ValidationError when name is empty', async () => {
    const service = new ProductService(mockProductRepo());
    await expect(service.createProduct({ name: '', kind: 'SAAS_USAGE' })).rejects.toThrow(
      ValidationError
    );
  });

  it('creates a product when data is valid', async () => {
    const repo = mockProductRepo();
    const service = new ProductService(repo);
    const result = await service.createProduct({ name: 'Ninja Notes', kind: 'SAAS_USAGE' });
    expect(result.name).toBe('Ninja Notes');
    expect(repo.create).toHaveBeenCalledOnce();
  });
});
```

Create `lib/db/repositories/__mocks__/product.ts`:

```typescript
import { vi } from 'vitest';
import type { Product } from '@prisma/client';

export function mockProductRepo() {
  return {
    create: vi.fn().mockResolvedValue({ id: 'p1', name: 'Ninja Notes', kind: 'SAAS_USAGE', isActive: true } as Product),
    findById: vi.fn().mockResolvedValue(null),
    listActive: vi.fn().mockResolvedValue([]),
    listAll: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ id: 'p1', name: 'Ninja Notes', kind: 'SAAS_USAGE', isActive: true } as Product),
  };
}
```

Run: `npx vitest run lib/services/product.test.ts`
Expected: FAIL.

- [ ] **Step 4: Create `lib/services/product.ts`**

```typescript
import { z } from 'zod';
import { ValidationError } from '../utils/errors';
import type { ProductRepository } from '../db/repositories/product';

const CreateProductSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  kind: z.enum(['SAAS_USAGE', 'PACKAGED_LABOR', 'CUSTOM_LABOR']),
});

export class ProductService {
  constructor(private repo: ProductRepository) {}

  async createProduct(data: unknown) {
    const parsed = CreateProductSchema.safeParse(data);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }
    return this.repo.create({ ...parsed.data, isActive: true });
  }

  async updateProduct(id: string, data: unknown) {
    const parsed = z.object({ name: z.string().min(1).optional(), isActive: z.boolean().optional() }).safeParse(data);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }
    return this.repo.update(id, parsed.data);
  }

  async listProducts() {
    return this.repo.listAll();
  }
}
```

- [ ] **Step 5: Run service tests**

```bash
npx vitest run lib/services/product.test.ts lib/db/repositories/product.test.ts
```

Expected: All pass (repo test requires test DB; mark as integration test and run separately in CI if needed).

- [ ] **Step 6: Export from barrels**

In `lib/db/repositories/index.ts`: `export { ProductRepository } from './product';`
In `lib/services/index.ts`: `export { ProductService } from './product';`

- [ ] **Step 7: Commit**

```bash
git add lib/db/repositories/product.ts lib/db/repositories/product.test.ts lib/db/repositories/__mocks__/product.ts lib/services/product.ts lib/services/product.test.ts lib/db/repositories/index.ts lib/services/index.ts
git commit -m "feat(admin): ProductRepository and ProductService with validation"
```

---

### Task 2.2-B: VendorRate, Persona, FixedCost repositories and sub-services

**Follow the exact same pattern as Task 2.2-A** for each entity. The mock repository pattern, Zod validation in the service, and barrel export are identical. Details per entity:

**VendorRate** (`lib/db/repositories/vendor-rate.ts`):
- `create(data: { productId, name, unitLabel, usdRate: Decimal })` → `VendorRate`
- `findByProduct(productId)` → `VendorRate[]`
- `update(id, data: { name?, unitLabel?, usdRate? })` → `VendorRate`
- `delete(id)` → `void` (only if no BaseUsage rows reference it)
- Service validates `usdRate >= 0`.

**BaseUsage** (`lib/db/repositories/base-usage.ts`):
- `upsert(data: { productId, vendorRateId, usagePerUserPerMonth: Decimal })` → `BaseUsage`
- `findByProduct(productId)` → `BaseUsage[]`
- Service validates usage is non-negative.

**OtherVariable** (`lib/db/repositories/other-variable.ts`):
- `upsert(data: { productId, amountPerUserPerMonth: Decimal })` → `OtherVariable`
- Service validates amount >= 0.

**Persona** (`lib/db/repositories/persona.ts`):
- `create(data: { productId, name, multiplier: Decimal })` → `Persona`
- `findByProduct(productId)` → `Persona[]`
- `update(id, data: { name?, multiplier? })` → `Persona`
- `delete(id)` → `void`
- Service validates multiplier > 0.

**ProductFixedCost** (`lib/db/repositories/product-fixed-cost.ts`):
- `create(data: { productId, name, monthlyUsd: Decimal })` → `ProductFixedCost`
- `findByProduct(productId)` → `ProductFixedCost[]`
- `update(id, data: { name?, monthlyUsd? })` → `ProductFixedCost`
- `delete(id)` → `void`

**ProductScale** (`lib/db/repositories/product-scale.ts`):
- `upsert(data: { productId, activeUserCount: number })` → `ProductScale`
- Service validates activeUserCount > 0.

**ListPrice** (`lib/db/repositories/list-price.ts`):
- `upsert(data: { productId, usdPerSeatPerMonth: Decimal })` → `ListPrice`
- Service validates price > 0.

**VolumeDiscountTier** (`lib/db/repositories/volume-discount-tier.ts`):
- `create(data: { productId, minSeats: number, discountPct: Decimal })` → `VolumeDiscountTier`
- `findByProduct(productId)` → `VolumeDiscountTier[]` (ordered by `minSeats`)
- `delete(id)` → `void`
- Service validates tiers have non-decreasing `minSeats`, `discountPct` in [0, 100].

**ContractLengthModifier** (`lib/db/repositories/contract-length-modifier.ts`):
- `create(data: { productId, minMonths: number, discountPct: Decimal })` → `ContractLengthModifier`
- `findByProduct(productId)` → `ContractLengthModifier[]` (ordered by `minMonths`)
- `delete(id)` → `void`
- Service validates tiers have non-decreasing `minMonths`.

- [ ] **Step 1–N: For each entity above, follow the Task 2.2-A pattern: failing test → repository → service test → service → barrel export → commit.**

Each entity group is one commit:

```bash
git commit -m "feat(admin): VendorRateRepository and sub-service"
git commit -m "feat(admin): BaseUsage + OtherVariable repositories"
git commit -m "feat(admin): PersonaRepository and service"
git commit -m "feat(admin): ProductFixedCost + ProductScale repositories"
git commit -m "feat(admin): ListPrice + VolumeDiscountTier + ContractLengthModifier repositories"
```

---

### Task 2.2-C: Products admin UI pages

- [ ] **Step 1: Create `app/admin/products/page.tsx` — products list**

```tsx
import { db } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default async function ProductsPage() {
  const repo = new ProductRepository(db);
  const products = await repo.listAll();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Button asChild>
          <Link href="/admin/products/new">Add product</Link>
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Kind</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b last:border-0">
              <td className="py-3">
                <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline">
                  {p.name}
                </Link>
              </td>
              <td className="py-3 text-slate-600">{p.kind}</td>
              <td className="py-3">
                <Badge variant={p.isActive ? 'default' : 'secondary'}>
                  {p.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/admin/products/new/page.tsx` with a server-action-backed form**

The form collects `name` and `kind` (select). On submit, calls a server action:

```tsx
// app/admin/products/new/actions.ts
'use server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';
import { ProductService } from '@/lib/services/product';
import { ValidationError } from '@/lib/utils/errors';

export async function createProductAction(formData: FormData) {
  const service = new ProductService(new ProductRepository(db));
  try {
    const product = await service.createProduct({
      name: formData.get('name'),
      kind: formData.get('kind'),
    });
    redirect(`/admin/products/${product.id}`);
  } catch (e) {
    if (e instanceof ValidationError) {
      return { error: e.message };
    }
    throw e;
  }
}
```

```tsx
// app/admin/products/new/page.tsx
import { createProductAction } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function NewProductPage() {
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold mb-6">New product</h1>
      <form action={createProductAction} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kind">Kind</Label>
          <Select name="kind" required>
            <SelectTrigger>
              <SelectValue placeholder="Select kind" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SAAS_USAGE">SaaS (usage-based)</SelectItem>
              <SelectItem value="PACKAGED_LABOR">Packaged Labor</SelectItem>
              <SelectItem value="CUSTOM_LABOR">Custom Labor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit">Create product</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/admin/products/[id]/page.tsx`** — product overview with links to each sub-section:

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';

const SUB_SECTIONS = [
  { href: 'vendor-rates', label: 'Vendor Rates', desc: 'Cost inputs per usage metric' },
  { href: 'base-usage', label: 'Base Usage', desc: 'Usage-per-user-per-month baseline' },
  { href: 'other-variable', label: 'Other Variable', desc: 'Catch-all $/user/month' },
  { href: 'personas', label: 'Personas', desc: 'Usage multipliers (Light / Average / Heavy)' },
  { href: 'fixed-costs', label: 'Fixed Costs', desc: 'Infrastructure line items' },
  { href: 'scale', label: 'Active User Count', desc: 'Drives fixed cost per seat' },
  { href: 'list-price', label: 'List Price & Discounts', desc: 'Seat price, volume tiers, contract modifiers' },
  { href: 'rails', label: 'Rails', desc: 'Soft/hard guardrails — min margin, max discount, min seat price, min contract months' },
];

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const repo = new ProductRepository(db);
  const product = await repo.findById(params.id);
  if (!product) notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">{product.name}</h1>
      <p className="text-slate-500 text-sm mb-6">{product.kind}</p>
      <div className="grid gap-3">
        {SUB_SECTIONS.map(({ href, label, desc }) => (
          <Link
            key={href}
            href={`/admin/products/${product.id}/${href}`}
            className="flex items-center justify-between rounded-lg border p-4 hover:bg-slate-50 transition-colors"
          >
            <div>
              <p className="font-medium">{label}</p>
              <p className="text-sm text-slate-500">{desc}</p>
            </div>
            <span className="text-slate-400">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build sub-section pages following the same pattern**

Each sub-section page (`vendor-rates/page.tsx`, `personas/page.tsx`, etc.) follows:
1. Fetch data via the relevant repository.
2. Render a table or form showing current values.
3. Provide an add/edit form backed by a `'use server'` action in a co-located `actions.ts`.
4. On success, `redirect()` back to the same page; on `ValidationError`, return `{ error }` to display inline.

Commit after each sub-section:

```bash
git commit -m "feat(admin): product vendor rates page + actions"
git commit -m "feat(admin): product base-usage + other-variable pages + actions"
git commit -m "feat(admin): product personas page + actions"
git commit -m "feat(admin): product fixed-costs + scale pages + actions"
git commit -m "feat(admin): product list-price + discount tiers + contract modifiers pages + actions"
git commit -m "feat(admin): product rails page + actions"
```

- [ ] **Step 5: Build the rails sub-section page**

The rails page (`app/admin/products/[id]/rails/page.tsx`) fetches rails via `RailRepository.findByProduct(id)` and renders a table with one row per `RailKind`. Each row has:
- `kind` label (human-readable: "Min Margin %", "Max Discount %", "Min Seat Price", "Min Contract Months")
- `marginBasis` select (visible only when `kind === 'MIN_MARGIN_PCT'`): Contribution / Net
- `softThreshold` input (labeled "Warning at")
- `hardThreshold` input (labeled "Block at")
- `isEnabled` toggle

The server action validates thresholds using `RailService.upsert()` and redirects back on success. Threshold direction tooltip: for `MAX_DISCOUNT_PCT`, the warning threshold is larger than the block threshold (a lower max discount is stricter); the UI labels make this clear.

- [ ] **Step 6: TypeScript + lint check**

```bash
npx tsc --noEmit && npx eslint . --max-warnings 0
```

- [ ] **Step 7: Final Products + Rails domain commit**

```bash
git commit -m "feat(admin): complete Products admin domain (rates, personas, pricing, costs, rails)"
```

### Task 2.2-D: Rail repository and service

**Rail repository** (`lib/db/repositories/rail.ts`):
- `findByProduct(productId)` → `Rail[]`
- `upsert(data: { productId, kind, marginBasis?, softThreshold: Decimal, hardThreshold: Decimal, isEnabled })` → `Rail`

**Rail service** (`lib/services/rail.ts`):
- Validates `softThreshold <= hardThreshold` for `MIN_*` rails.
- For `MAX_DISCOUNT_PCT`: validates `hardThreshold <= softThreshold` (lower max discount = stricter).
- Validates `marginBasis` is set when `kind === 'MIN_MARGIN_PCT'`.
- Validates thresholds in [0, 100] for percentage rails; `> 0` for `MIN_SEAT_PRICE` and `MIN_CONTRACT_MONTHS`.

Write failing tests → implement → export from barrels → commit:

```bash
git commit -m "feat(admin): RailRepository + service with threshold validation"
```

---

## Phase 2.3 — Labor Domain

**Goal:** Admin can manage Labor SKUs (packaged labor catalog), Departments (with computed loaded rate display), Employees (with compensation), and Burdens.

**Why before Commissions/Bundles:** Department loaded rates feed commission base metrics and bundle line items. They need to exist before the editors for those entities can reference them.

### File map

```
lib/
  db/
    repositories/
      labor-sku.ts
      department.ts
      employee.ts
      burden.ts
  services/
    labor.ts                   (single service file covering all four entities)

app/
  admin/
    labor-skus/
      page.tsx
      new/
        page.tsx
        actions.ts
      [id]/
        page.tsx
        actions.ts
    departments/
      page.tsx                  (list with computed loaded rate column)
      new/
        page.tsx
        actions.ts
      [id]/
        page.tsx                (dept detail: bill rate edit + employee list)
        actions.ts
    employees/
      page.tsx
      new/
        page.tsx
        actions.ts
      [id]/
        page.tsx
        actions.ts
    burdens/
      page.tsx
      new/
        page.tsx
        actions.ts
      [id]/
        page.tsx
        actions.ts

components/
  admin/
    labor/
      LaborSKUForm.tsx
      DepartmentForm.tsx
      EmployeeForm.tsx
      BurdenForm.tsx
```

### Computed loaded rate formula

The computed loaded rate for a department is shown in the admin UI (not stored — derived at read time). The formula:

```
For each active employee in the department:
  base_annual = annual_salary OR (hourly_rate × standard_hours_per_year)
  burden_amount = Σ applicable burdens:
    rate × min(base_annual, cap_usd ?? Infinity)
  loaded_annual = base_annual + burden_amount
  loaded_hourly = loaded_annual / standard_hours_per_year

department_avg_loaded_hourly = sum(loaded_hourly per employee) / count(active employees)
```

This formula is implemented in `lib/services/labor.ts` as a pure function (no DB calls). It receives the employee + burden data already fetched by the repository.

### Task 2.3-A: Labor repositories

Follow the Task 2.2-A pattern exactly. Repository specs:

**LaborSKU** (`lib/db/repositories/labor-sku.ts`):
- `create(data: { productId, name, unit, costPerUnit: Decimal, defaultRevenuePerUnit: Decimal })` → `LaborSKU`
- `findByProduct(productId)` → `LaborSKU[]`
- `update(id, data)` → `LaborSKU`
- `delete(id)` → `void`
- Service validates `costPerUnit >= 0`, `defaultRevenuePerUnit >= 0`.

**Department** (`lib/db/repositories/department.ts`):
- `create(data: { name, isActive })` → `Department`
- `findById(id)` → `Department | null` (includes active employees + all burdens)
- `listAll()` → `Department[]`
- `update(id, data)` → `Department`
- Service method `computeLoadedRate(dept: DepartmentWithEmployeesAndBurdens)` → `Decimal` (the formula above — pure, testable in isolation).

**Employee** (`lib/db/repositories/employee.ts`):
- `create(data: { name, departmentId, compensationType, annualSalary?: Decimal, hourlyRate?: Decimal, standardHoursPerYear?: number, isActive })` → `Employee`
- `findByDepartment(departmentId)` → `Employee[]`
- `update(id, data)` → `Employee`
- Service validates: if `compensationType === 'ANNUAL_SALARY'` then `annualSalary` required; if `HOURLY` then `hourlyRate` and `standardHoursPerYear` required.

**Burden** (`lib/db/repositories/burden.ts`):
- `create(data: { name, ratePct: Decimal, capUsd?: Decimal, scope, departmentId?: string })` → `Burden`
- `listAll()` → `Burden[]`
- `update(id, data)` → `Burden`
- `delete(id)` → `void`
- Service validates `ratePct >= 0`, `capUsd >= 0 if provided`.

- [ ] **Step 1–N: Follow Task 2.2-A pattern for each repository. One commit per repository.**

```bash
git commit -m "feat(admin): LaborSKURepository + service"
git commit -m "feat(admin): DepartmentRepository + computeLoadedRate service method"
git commit -m "feat(admin): EmployeeRepository + compensation validation service"
git commit -m "feat(admin): BurdenRepository + service"
```

### Task 2.3-B: computeLoadedRate unit tests (pure function)

This formula is business-critical (it feeds commission base amounts and is the admin-visible cost signal). Test it thoroughly in `lib/services/labor.test.ts`:

- [ ] **Step 1: Write tests**

```typescript
import { computeLoadedHourlyRate } from './labor';
import { Decimal } from 'decimal.js';

describe('computeLoadedHourlyRate', () => {
  it('computes loaded rate for a salaried employee with FICA burden', () => {
    const result = computeLoadedHourlyRate({
      employee: { annualSalary: new Decimal('100000'), standardHoursPerYear: 2080 },
      burdens: [{ ratePct: new Decimal('7.65'), capUsd: null }],
    });
    // $100k × 7.65% = $7,650 burden → $107,650 / 2080 = $51.7548...
    expect(result.toFixed(4)).toBe('51.7548');
  });

  it('respects FUTA cap', () => {
    const result = computeLoadedHourlyRate({
      employee: { annualSalary: new Decimal('100000'), standardHoursPerYear: 2080 },
      burdens: [{ ratePct: new Decimal('6'), capUsd: new Decimal('7000') }],
    });
    // cap at $7k: burden = min($100k, $7k) × 6% = $420 → ($100k + $420) / 2080
    expect(result.toFixed(4)).toBe('48.2885');
  });

  it('returns 0 for department with no active employees', () => {
    expect(computeLoadedHourlyRate(null)).toEqual(new Decimal(0));
  });
});
```

- [ ] **Step 2: Implement in `lib/services/labor.ts`**

```typescript
export function computeLoadedHourlyRate(
  input: {
    employee: { annualSalary: Decimal | null; hourlyRate: Decimal | null; standardHoursPerYear: number | null };
    burdens: Array<{ ratePct: Decimal; capUsd: Decimal | null }>;
  } | null
): Decimal {
  if (!input) return new Decimal(0);
  const { employee, burdens } = input;
  const hoursPerYear = new Decimal(employee.standardHoursPerYear ?? 2080);
  const baseAnnual = employee.annualSalary ?? (employee.hourlyRate!.mul(hoursPerYear));
  const burdenTotal = burdens.reduce((acc, b) => {
    const base = b.capUsd ? Decimal.min(baseAnnual, b.capUsd) : baseAnnual;
    return acc.plus(base.mul(b.ratePct).div(100));
  }, new Decimal(0));
  return baseAnnual.plus(burdenTotal).div(hoursPerYear);
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run lib/services/labor.test.ts
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add lib/services/labor.ts lib/services/labor.test.ts
git commit -m "feat(admin): computeLoadedHourlyRate with burden caps"
```

### Task 2.3-C: Labor UI pages

Follow the same pattern as Phase 2.2-C. Key differences:

- **Departments page** shows a "Computed loaded rate" column (formatted as `$XX.XX/hr`), fetched by calling `computeLoadedHourlyRate` per department on the server. The bill rate column is editable inline (a small form per row) or via the detail page.
- **Department detail page** (`/admin/departments/[id]`) shows: department name, bill rate (editable), computed loaded rate (read-only, labeled "average loaded cost"), and a list of assigned employees with compensation details.
- **Employees page** is a flat list across all departments with department name as a column. "Add employee" form has a department select.
- **Burdens page** shows all burdens with scope column (All / Department name). FUTA's cap is shown in the cap column.

- [ ] **Step 1–N: Build pages + actions per section, following Phase 2.2-C pattern. One commit per section.**

```bash
git commit -m "feat(admin): Labor SKUs admin page + CRUD"
git commit -m "feat(admin): Departments page with computed loaded rate display"
git commit -m "feat(admin): Department detail page with employee list"
git commit -m "feat(admin): Employees admin page + CRUD with compensation fields"
git commit -m "feat(admin): Burdens admin page + CRUD with cap field"
```

---

## Phase 2.4 — Commissions + Bundles

**Goal:** Admin can define commission rules with progressive tiers, and bundle templates that pre-fill scenario tabs.

**Dependency note:** Commission rules can reference specific products (for `TAB_REVENUE`/`TAB_MARGIN` scoping) and departments. Both must exist (Phases 2.2 and 2.3) before this editor is buildable. Bundles can reference products, personas, labor SKUs, and departments — same dependency.

### File map

```
lib/
  db/
    repositories/
      commission-rule.ts
      bundle.ts
  services/
    commission.ts
    bundle.ts

app/
  admin/
    commissions/
      page.tsx                  (rules list)
      new/
        page.tsx
        actions.ts
      [id]/
        page.tsx                (rule detail + tier editor)
        actions.ts
    bundles/
      page.tsx
      new/
        page.tsx
        actions.ts
      [id]/
        page.tsx                (bundle detail + items editor)
        actions.ts
```

### Task 2.4-A: CommissionRule repository and service

**CommissionRule repository** (`lib/db/repositories/commission-rule.ts`):
- `create(data: { name, scopeType, scopeProductId?, scopeDepartmentId?, baseMetric, recipientEmployeeId?, notes?, isActive })` → `CommissionRule`
- `findById(id)` → `CommissionRule & { tiers: CommissionTier[] } | null`
- `listAll()` → `(CommissionRule & { tiers: CommissionTier[] })[]`
- `update(id, data)` → `CommissionRule`
- `addTier(ruleId, data: { thresholdFromUsd: Decimal, ratePct: Decimal })` → `CommissionTier`
- `deleteTier(tierId)` → `void`

**Service validation** (`lib/services/commission.ts`):
- On create/update: if `baseMetric` is `TAB_REVENUE` or `TAB_MARGIN`, `scopeProductId` must be set. If `scopeType === 'DEPARTMENT'`, `scopeDepartmentId` must be set. (This mirrors the engine-level guard added in 2.0-B — the service prevents the invalid state from being persisted in the first place.)
- On `addTier`: `thresholdFromUsd >= 0`, `ratePct` in [0, 100]. Tiers must have non-decreasing thresholds (validate against existing tiers before adding).

- [ ] **Step 1–N: Follow Task 2.2-A pattern. One commit for repo, one for service.**

### Task 2.4-B: Bundle repository and service

**Bundle repository** (`lib/db/repositories/bundle.ts`):
- `create(data: { name, description?, isActive })` → `Bundle`
- `findById(id)` → `Bundle & { items: BundleItem[] } | null`
- `listActive()` → `(Bundle & { items: BundleItem[] })[]`
- `addItem(bundleId, data: { productId, config: object })` → `BundleItem`
- `removeItem(itemId)` → `void`
- `update(id, data: { name?, description?, isActive? })` → `Bundle`

**Bundle service** (`lib/services/bundle.ts`):
- `config` JSONB is untyped at the DB level. The service validates config shape against `productKind`:
  - `SAAS_USAGE`: `{ seatCount: number, personaMix: {personaId, pct}[], discountOverridePct?: number }`
  - `PACKAGED_LABOR`: `{ lines: [{skuId, qty}] }`
  - `CUSTOM_LABOR`: `{ lines: [{departmentId, hours}] }`
- Validated with Zod discriminated union before writing to DB.

- [ ] **Step 1–N: Follow Task 2.2-A pattern.**

### Task 2.4-C: Commissions + Bundles UI pages

**Commissions list page:** table of rules with name, scope, base metric, active badge. Clicking a rule opens the detail page.

**Commission detail page:** rule fields (editable) + tier editor. Tier editor shows a table (threshold_from, rate%) with "Add tier" form at the bottom and delete buttons per row. Tiers display in threshold order.

**Bundles list page:** table of bundles with name, item count, active badge.

**Bundle detail page:** bundle name/description (editable) + items list. Items show product name, kind, and a summary of the config (e.g., "10 seats, Average mix"). "Add item" opens a dialog with a product select; after selecting a product, the config form adapts to the product's `kind` (SaaS shows seat count + persona mix; labor shows SKU/department picker + qty/hours).

- [ ] **Step 1–N: Build each page + actions. One commit per section.**

```bash
git commit -m "feat(admin): Commission rules list and detail with tier editor"
git commit -m "feat(admin): Bundles list and detail with items editor"
```

---

## Phase 2.5 — Users

**Goal:** Admin can invite users by email and set roles. Rails are handled as a sub-section of each product's detail page (Phase 2.2).

### File map

```
lib/
  db/
    repositories/
      user.ts
  services/
    user.ts

app/
  admin/
    users/
      page.tsx                  (user list)
      invite/
        page.tsx
        actions.ts
      [id]/
        page.tsx                (role edit)
        actions.ts
```

### Task 2.5-A: User repository and service

**User repository** (`lib/db/repositories/user.ts`):
- `listAll()` → `User[]`
- `findByEmail(email)` → `User | null`
- `create(data: { email, name?, role })` → `User` (creates a placeholder user; SSO will link on first login)
- `updateRole(id, role: 'ADMIN' | 'SALES')` → `User`

**User service** (`lib/services/user.ts`):
- `inviteUser(data: { email, role })`: validates email format, checks no existing user with that email, creates user row.
- `updateRole(id, role)`: validates role is `ADMIN` or `SALES`. Does not allow the caller to demote themselves (service receives `callerId` and throws if `id === callerId` and `role === 'SALES'`).

### Task 2.5-B: Users UI pages

**Users list page** (`/admin/users`): table of users with name, email, role badge, last sign-in. "Invite user" button.

**Invite user page** (`/admin/users/invite`): email input + role select. On submit, calls `inviteUser` service action.

**User detail page** (`/admin/users/[id]`): shows user info + role select. Changing role and saving calls `updateRole`. Admin cannot demote their own account (the role select is disabled for the viewing admin's own row).

- [ ] **Step 1–N for 2.5-A and 2.5-B: Follow established patterns. One commit per section.**

```bash
git commit -m "feat(admin): UserRepository + service with self-demotion guard"
git commit -m "feat(admin): Users admin pages — invite + role management"
```

---

## File Map Summary

All files created or modified across Phase 2:

```
lib/
  db/
    repositories/
      index.ts
      __mocks__/
        product.ts  (+ equivalents per entity)
      product.ts            vendor-rate.ts        persona.ts
      base-usage.ts         other-variable.ts     product-fixed-cost.ts
      product-scale.ts      list-price.ts         volume-discount-tier.ts
      contract-length-modifier.ts
      rail.ts               (per-product, lives with Products domain in Phase 2.2)
      labor-sku.ts          department.ts         employee.ts
      burden.ts
      commission-rule.ts    bundle.ts
      user.ts
  services/
    index.ts
    product.ts              (+ tests)
    rail.ts                 (+ tests; per-product guardrails, lives with Products domain)
    labor.ts                (+ tests, includes computeLoadedHourlyRate)
    commission.ts           (+ tests)
    bundle.ts               (+ tests)
    user.ts                 (+ tests)
  engine/                   (modified in Phase 2.0 only)
    saas-tab.ts             saas-cost.ts          saas-discount.ts
    rails.ts                commissions.ts        mix.ts
    compute.ts              types.ts
  auth/
    middleware-helpers.ts   (+ tests)
    session.ts
middleware.ts
auth.ts

app/
  admin/
    layout.tsx
    page.tsx
    products/               (page, new/page+actions, [id]/page, [id]/vendor-rates, [id]/base-usage,
                             [id]/other-variable, [id]/personas, [id]/fixed-costs, [id]/scale,
                             [id]/list-price, [id]/rails — all with page+actions)
    labor-skus/             (page, new/page+actions, [id]/page+actions)
    departments/            (page, new/page+actions, [id]/page+actions)
    employees/              (page, new/page+actions, [id]/page+actions)
    burdens/                (page, new/page+actions, [id]/page+actions)
    commissions/            (page, new/page+actions, [id]/page+actions)
    bundles/                (page, new/page+actions, [id]/page+actions)
    users/                  (page, invite/page+actions, [id]/page+actions)

components/
  admin/
    AdminSidebar.tsx        AdminShell.tsx
    AdminSidebar.test.tsx
    products/               (ProductForm, VendorRateForm, PersonaForm, FixedCostForm, DiscountTierForm, ContractModifierForm)
    labor/                  (LaborSKUForm, DepartmentForm, EmployeeForm, BurdenForm)
  ui/                       (shadcn-generated — do not edit directly)

tests/
  middleware.test.ts
```

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Bundle config JSONB shape validation is complex | Medium | Medium | Validate with Zod discriminated union in the service; write unit tests per kind before building the UI. |
| Computed loaded rate changes with every employee edit; admins may not realize | Low | Medium | Show a "as of now" label; add a reload/refresh button on the department page after edits. No caching — always fresh from DB. |
| shadcn Select component and Next.js Server Actions don't play well (client component needed) | Medium | Low | Mark forms with `'use client'` only for the interactive select; keep the page itself a Server Component fetching data. |
| Commission tier editor UX is complex (ordered, non-decreasing thresholds, delete-then-re-add) | Medium | Low | Ship a simple append-only + delete table first. Reordering is not needed in v1. |
| Microsoft SSO not available in local dev; seed admin can't sign in normally | High | Low | Documented already in seed.ts; dev can use NextAuth credentials provider or a test-bypass env var. Not a prod risk. |
| Rails threshold ordering for MAX_DISCOUNT_PCT is counterintuitive (lower = stricter) | Low | Medium | UI labels: rename "soft" to "Warning at" and "hard" to "Block at"; explain in tooltip that for max-discount rails, the block threshold must be ≤ warning threshold. |

---

## Milestones

| Milestone | Definition of done |
|-----------|-------------------|
| **M1: Intake complete** | All 13 Phase 1 follow-ups resolved; `npx vitest run`, `npx tsc --noEmit`, `npx eslint . --max-warnings 0` all green. |
| **M2: Admin foundation** | `/admin/*` is role-guarded at middleware; admin sidebar renders; repo + service barrel pattern is established. |
| **M3: Products done** | Admin can add a product, add vendor rates, set personas, fixed costs, list price, and all discount tiers. Engine can be fed a valid rate snapshot assembled from the DB. |
| **M4: Labor done** | Admin can add departments with employees and burdens; computed loaded rate is displayed; bill rate is editable. |
| **M5: Commissions + Bundles done** | Admin can define commission rules with tiers; bundles can reference products and labor. |
| **M6: Users done** | Admin can invite users and change roles. Phase 2 feature-complete. (Rails ship as part of M3, co-located with products.) |
| **M7: Phase 2 verification** | End-to-end admin flow verified: add product → configure all rate cards → add employees + burdens → define commission rule → create bundle → set rails → invite user. No TypeScript errors, no lint warnings, all unit + integration tests green. Phase 3 can begin. |

---

## Acceptance Criteria

### Functional

- [ ] An admin can navigate to every entity group in the sidebar and see a list of existing records.
- [ ] An admin can create, edit, and (where applicable) delete every entity type defined in the Prisma schema: `Product`, `VendorRate`, `BaseUsage`, `OtherVariable`, `Persona`, `ProductFixedCost`, `ProductScale`, `ListPrice`, `VolumeDiscountTier`, `ContractLengthModifier`, `LaborSKU`, `Department`, `Employee`, `Burden`, `CommissionRule`, `CommissionTier`, `Bundle`, `BundleItem`, `Rail`, `User`.
- [ ] The Departments page shows the computed average loaded hourly rate derived from active employees and burdens. This value updates on reload after employee/burden edits.
- [ ] Commission rules with `TAB_REVENUE` or `TAB_MARGIN` base metrics cannot be saved without a `scopeProductId`. The UI enforces this (product select appears when these base metrics are chosen).
- [ ] Bundle config is validated server-side against product kind. Invalid configs return a human-readable error; the DB is never written with malformed JSONB.
- [ ] Rail thresholds cannot be saved with `softThreshold > hardThreshold` for min-style rails (or `softThreshold < hardThreshold` for max-discount rails). The service throws `ValidationError`; the UI shows the error inline.
- [ ] A SALES-role user who navigates to any `/admin/*` URL is redirected to `/scenarios` by middleware before any server component runs.
- [ ] An admin cannot demote their own account from ADMIN to SALES via the Users page (the action throws; the UI shows an error).

### Non-functional

- [ ] `npx tsc --noEmit` passes with zero errors across the entire project.
- [ ] `npx eslint . --max-warnings 0` passes.
- [ ] `npx vitest run` passes — all unit tests and service mock tests green.
- [ ] All service integration tests (requiring test DB) pass in CI.
- [ ] Money values are never stored or computed as JavaScript `number` in the service or engine layers. Prisma `Decimal` fields flow into `decimal.js` `Decimal`; `toCents()` is the only conversion point to `number`.
- [ ] No Prisma imports appear in `lib/engine/`. `lib/engine` remains pure.
- [ ] Each server action validates input with Zod before calling the service; raw form data never reaches the repository.

---

## Phase 2 → Phase 3 handoff

At the end of Phase 2:

- Admin has populated: products + all rate cards, personas, bundles, commissions, rails, users.
- The repository + service layer is complete and tested.
- Phase 3 (Sales UI) inherits all repos and services and adds `ScenarioRepository`, `ScenarioService`, and the compute endpoint that assembles a rate snapshot from the DB and calls `lib/engine/compute.ts`.
- No rework of admin pages is expected in Phase 3 except minor read-only views (e.g., a read-only bundle preview when a sales rep applies one).
