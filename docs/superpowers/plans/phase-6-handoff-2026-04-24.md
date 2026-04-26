# Phase 6 — Mid-Phase Handoff (2026-04-24)

Handoff document for a fresh Claude session to resume Phase 6 execution from Task 6-I.

## Workspace

- **Worktree:** `/Users/boldry/git/NinjaPricer/.claude/worktrees/phase-6-omni-metered`
- **Branch:** `phase-6-omni-metered` (branched off `main` at `80b05cd`)
- **Env:** `.env.local` is a symlink to the parent repo's file (untracked, required for Prisma commands).
- **Baseline tsc state:** `npx tsc --noEmit` reports **22 pre-existing errors** in unrelated test files (`lib/hubspot/*`, `app/scenarios/[id]/from-deal/route.db.test.ts`). **Do not regress below this — do not be alarmed it's not zero.** The Phase 6 branch maintains exactly 22 throughout.
- **Test baseline after 6-H:** 636 pass / 97 skipped / 0 fail.

## Plan + spec

- Plan: [`docs/superpowers/plans/2026-04-24-v2-phase-6-omni-products-and-metered-saas.md`](2026-04-24-v2-phase-6-omni-products-and-metered-saas.md)
- Spec: [`docs/superpowers/specs/2026-04-23-v2-phase-6-omni-products-and-metered-saas-design.md`](../specs/2026-04-23-v2-phase-6-omni-products-and-metered-saas-design.md)

## Completed tasks (6-A through 6-H)

| Task                           | SHA(s)                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6-A: Prisma schema + migration | `30d9bc17`                     | Migration `20260424151236_phase_6_metered_saas` applied.                                                                                                                                                                                                                                                                                                                                                                                                          |
| 6-B: Engine type additions     | `d5bc972` + fix `f423d8c`      | Fix added `revenueModel: 'PER_SEAT'` / `meteredPricing: null` stub to `lib/services/rateSnapshot.ts` so tree stayed green between B and F.                                                                                                                                                                                                                                                                                                                        |
| 6-C: Metered compute path      | `a02f7a5` + refactor `cbd7ea1` | Refactor replaced hand-rolled filter+reduce with existing `pickContractDiscount` helper.                                                                                                                                                                                                                                                                                                                                                                          |
| 6-D: Golden fixture            | `3648e59`                      | **Note:** `personaMix.pct` uses `100` (percentage), not `1` (fraction). The original plan said `1`; this is the correct engine convention.                                                                                                                                                                                                                                                                                                                        |
| 6-E: MeteredPricing repo       | `7647e36` + refactor `31077d0` | Refactor aligned with `listPrice.ts` conventions: uses `Prisma.Decimal` for monetary fields, `db` for injected field name, explicit `Promise<...>` return types. Test uses `new Prisma.Decimal(...)` in fixtures.                                                                                                                                                                                                                                                 |
| 6-F: Rate snapshot             | `805dfef`                      | Threaded `revenueModel` + `meteredPricing` + scenario committed/expected fields. Used conditional-spread idiom for `exactOptionalPropertyTypes`.                                                                                                                                                                                                                                                                                                                  |
| 6-G: MeteredPricingService     | `796369e`                      | Zod input schema uses plain `number`s; service converts to `Prisma.Decimal` at the repo boundary. Pattern divergence from `listPrice.ts` (which accepts Decimal at the boundary) — noted as follow-up.                                                                                                                                                                                                                                                            |
| 6-H: Product invariants        | `aa7d6d9`                      | **Important adaptation:** `ProductService` uses DI on `IProductRepository`, not direct `prisma.*` calls. Implementer extended the interface with three new query helpers (`findListPriceByProductId`, `findMeteredPricingByProductId`, `countScenarioSaaSConfigsByProductId`) and added matching mocks in `__mocks__/product.ts`. **Also added `revenueModel: 'PER_SEAT'` to the mock's `fakeProduct`** — future tests using this mock already carry the default. |

## Open follow-ups (review findings, NOT blockers)

Capture these to `docs/superpowers/backlog.md` at phase end (Task 6-U) if not addressed during remaining tasks:

1. **Service-pattern divergence** — `meteredPricing.ts` accepts plain numbers and converts to Decimal internally; `listPrice.ts` accepts `Decimal` at the service boundary. Not wrong, but stylistically inconsistent. Pick one style for the codebase in a follow-up refactor.
2. **`costPerUnitUsd` vs `overageRatePerUnitUsd` invariant** — no enforcement that overage rate ≥ cost per unit. If admins set an underwater rate, the engine will produce a negative margin but no validation error. Consider a `.refine()` or service-level sanity check.
3. **Zod bounds on `meteredPricingInputSchema`** — add `.finite()` on monetary fields; consider upper caps on `includedUnitsPerMonth` to catch fat-fingered entries.
4. **Em-dash in ValidationError messages** (`product.ts`) — other services use ASCII `-`. Normalize to match house style.
5. **Pre-existing broken mock file** — `lib/db/repositories/__mocks__/product.ts` was pre-existing broken on main (missing `hubspotProductId`). 6-H fixed the `revenueModel` part but the file is still missing `hubspotProductId`. Not our bug to fix in Phase 6 — flag separately.
6. **Golden fixture weak notes assertion** — 6-D's `expect(notes.monthlyRevenueCents).toBeGreaterThan(0)` doesn't lock in a specific value. Intentional (per-seat numerics covered by other goldens), but could be tightened.

## How to resume

1. Invoke `superpowers:subagent-driven-development` (or start fresh with `superpowers:executing-plans`).
2. Point at the remaining tasks 6-I through 6-U in [`docs/superpowers/plans/2026-04-24-v2-phase-6-omni-products-and-metered-saas.md`](2026-04-24-v2-phase-6-omni-products-and-metered-saas.md).
3. Next task is **6-I: Service gates — per-seat mutations rejected on METERED**. It touches 8 service files to add the `assertProductRevenueModel` gate. **Note:** since services use varying patterns (some DI-repo, some direct prisma), the helper may need to live in a shared location rather than being bolted onto `product.ts`. The task text allows this (`lib/services/_revenueModelGuard.ts` is one suggested home).

## Remaining tasks

- **6-I** — Service gates for `listPrice`, `volumeDiscountTier`, `persona`, `otherVariable`, `baseUsage`, `vendorRate`, `productScale` + rail-kind gating. ~8 files + tests.
- **6-J** — Scenario config service accepts `committedUnitsPerMonth` + `expectedActualUnitsPerMonth` with cross-field validation vs product revenueModel.
- **6-K** — MCP tools: new `set_metered_pricing` + `get_metered_pricing` in `lib/mcp/tools/catalog/meteredPricing.ts`, plus updates to `reads.ts` (include metered pricing in product responses) and `scenarioWrites.ts` (accept metered fields in `set_scenario_saas_config`).
- **6-L** — Admin product create page dropdown for `revenueModel` on `SAAS_USAGE` products.
- **6-M** — Admin product detail page: hide per-seat sections for METERED, add new Metered Pricing section + form + server action.
- **6-N** — Admin rail editor: filter kinds when product is METERED.
- **6-O** — Sales scenario-builder metered tab (new route segment `app/scenarios/[id]/metered/[productId]/page.tsx`; per the updated plan Section 6-O, do NOT generalize the existing `notes/` route).
- **6-P** — Quote + internal PDFs: new metered line-item block with `unitLabel` threaded from `MeteredPricing`.
- **6-Q** — HubSpot catalog translator: METERED products as recurring HubSpot products + metered custom properties.
- **6-R** — HubSpot quote translator: metered tab → recurring + overage line items; reconcile against frozen Quote totals.
- **6-S** — Seed Omni Sales (`PER_SEAT`, inactive) + Omni Concierge (`METERED`, inactive, with MeteredPricing template row).
- **6-T** — Final gates: full `tsc --noEmit` (still 22), `eslint`, `prettier --write`, full `vitest run`.
- **6-U** — Update `docs/superpowers/backlog.md` — mark Phase 6 shipped; carry over open follow-ups from this document.
