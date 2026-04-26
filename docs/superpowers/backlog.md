# Ninja Pricer — Forward Backlog

> Running list of deferred work items. Each entry names the source (the phase or spec that deferred it) and a one-line rationale. Items move out of this file when they become a planned phase; the entry is replaced with a link to the phase plan.

Phases already shipped are not listed here — consult `git log` and `docs/superpowers/plans/`.

---

## Engine / Product

### Engine should expose `committedMonthlyAfterDiscountCents` and `overageRevenueCents` on `SaaSMeta.metered`

- **Source:** Phase 6 (Tasks 6-O, 6-P review)
- **Why deferred:** Today the metered tab UI (`MeteredTabForm`) and the customer/internal PDFs each re-derive these from raw inputs (`committedMonthlyUsd × (1 - contractDiscountPct)`, `overageRatePerUnit × overageUnits`). Math matches engine *today*; if pricing rules grow (tiered overage, overage caps, minimum-commit floors, currency rounding rules), the surfaces silently drift. Promote both to engine-computed meta fields and have UI/PDF read them.

### Sub-cent rounding in `formatUsdDecimal` collapses real overage rates to `$0.00`

- **Source:** Phase 6 (Task 6-P review)
- **Why deferred:** Both `lib/pdf/customer.tsx` and `lib/pdf/internal.tsx` use `Math.round(n * 100)` for USD formatting. A `$0.0043 / minute` Deepgram-style rate (already in `lib/engine/saas-tab.test.ts:11`) renders as `$0.00`. The metered pricing schema (`lib/services/meteredPricing.ts:12`) is `z.number().min(0)` with no precision floor. Need a Decimal-aware formatter that picks 2/4/6 decimals by magnitude (or at minimum 4-decimal precision for unit rates).

### Pluralization in metered descriptions / line-item names

- **Source:** Phase 6 (Tasks 6-Q, 6-R review)
- **Why deferred:** HubSpot translator (`np_metered_unit_label`) and quote line items use `${unitLabel}s` naively, producing `"API callss"` if catalog labels are pluralized, or `"1 minutes"` for a quantity of 1. Document `unitLabel` MUST be singular OR add a real plural helper / `unitLabelPlural` catalog field.

### Real product name (not `Subscription (productId)`) in customer PDF tabs

- **Source:** Phase 6 (Task 6-P review)
- **Why deferred:** Line-items table and metered detail block both render `Subscription (${productId})` per existing PDF convention. Threading `productName` through `RenderArgs.products` or onto `TabResult` would clean this up across the entire customer PDF (per-seat too).

### `costPerUnitUsd` vs `overageRatePerUnitUsd` invariant

- **Source:** Phase 6 (mid-phase handoff)
- **Why deferred:** No enforcement that overage rate ≥ cost per unit. If admins set an underwater rate, the engine produces a negative margin but no validation error. Consider a `.refine()` or service-level sanity check in `meteredPricing.ts`.

### Reconciliation gate: `Σ (qty × price)` translator output ≈ engine `computeResult.totals`

- **Source:** Phase 6 (Task 6-R review)
- **Why deferred:** No assertion in `lib/hubspot/quote/publish.ts` reconciles HubSpot line items against the frozen `Quote.totals`. Add an invariant check (with explicit handling that overage usage is forecast, not committed) so a published quote can be diffed against engine truth before send.

### Volume discount tiers on committed units (metered)

- **Source:** [Phase 6 — Omni + Metered SaaS](specs/2026-04-23-v2-phase-6-omni-products-and-metered-saas-design.md)
- **Why deferred:** Phase 6 ships a single committed fee per metered product. Tiering on committed units (e.g. 5k / 10k / 25k buckets each with their own monthly + overage) is a later enhancement once usage-shape data is real.
- **Shape:** reinterpret / parallel `VolumeDiscountTier` for metered, keyed on `minUnits`.

### `MIN_MONTHLY_FEE` rail kind

- **Source:** [Phase 6 — Omni + Metered SaaS](specs/2026-04-23-v2-phase-6-omni-products-and-metered-saas-design.md)
- **Why deferred:** `MIN_SEAT_PRICE` does not apply to metered; a floor on committed monthly is the metered analog. Not needed until a negotiated metered deal goes below some floor.

### Multiple cost types per metered product

- **Source:** [Phase 6 — Omni + Metered SaaS](specs/2026-04-23-v2-phase-6-omni-products-and-metered-saas-design.md)
- **Why deferred:** Phase 6 assumes one cost-per-unit (confirmed sufficient for Omni Concierge v1). Voice vs. chat vs. peak/off-peak would need a cost-mix model and a scenario-level usage-mix input.

### Historical rate-card versioning

- **Source:** [v1 design "Out of v1"](specs/2026-04-17-ninja-pricer-v1-design.md)
- **Why deferred:** Quote snapshots (frozen totals + saved PDF) provide the audit trail today. Rebuilding "what was the rate on date X" would require effective-dated rate cards — deferred until a concrete business driver surfaces.

### Auto-costing labor SKUs from department rates

- **Source:** [v1 design "Out of v1"](specs/2026-04-17-ninja-pricer-v1-design.md)
- **Why deferred:** Today labor SKU costs are admin-entered flat numbers. Auto-costing = `department.loadedRate × sku.hours`, kept in sync as employees/burdens change. Small engine + admin toggle; closes a real data-drift hole.

## Scenarios

### UI to add a METERED product to a scenario

- **Source:** Phase 6 (Task 6-O review)
- **Why deferred:** A METERED product appears in the scenario builder's left-nav only after a `ScenarioSaaSConfig` row exists for it on this scenario. Today the only ways to seed one are MCP, bundle apply, or direct DB insert. Need a sales-facing "Add product to scenario" affordance.

### Notes route should require `revenueModel: PER_SEAT`

- **Source:** Phase 6 (Task 6-O review) — pre-existing fragility
- **Why deferred:** `app/scenarios/[id]/notes/page.tsx` does `findFirst({ kind: 'SAAS_USAGE' })` which would grab a METERED product if no PER_SEAT exists on the scenario. Today the only PER_SEAT product is Ninja Notes so it works in practice. Tighten the filter to `revenueModel: 'PER_SEAT'` to make the contract explicit.

### Scenario sharing / collaboration

- **Source:** [v1 design "Out of v1"](specs/2026-04-17-ninja-pricer-v1-design.md)
- **Why deferred:** v1 model is single-owner per scenario. Multi-owner ACL + activity + comments is its own phase.

## Platform

### Add `app/**/*.test.tsx` to vitest config

- **Source:** Phase 6 (Tasks 6-K, 6-L review)
- **Why deferred:** `vitest.config.ts` `include` array covers `lib/**/*.test.{ts,tsx}`, `app/**/*.test.ts`, `tests/**/*.test.ts`, `components/**/*.test.tsx` — but NOT `app/**/*.test.tsx`. Any React-component test colocated under `app/` is silently ignored. Trivial one-line fix; would unblock test coverage for `NewProductForm`, `MeteredPricingForm`, and any future App Router client component.

### Staging environment

- **Source:** [v1 design "Out of v1"](specs/2026-04-17-ninja-pricer-v1-design.md)
- **Why deferred:** Single Railway prod env today. Staging needs a second Railway project, separate DB, separate HubSpot private app + webhook URLs, CI promotion flow.

### Playwright e2e harness + Phase 4 quote-generation smoke

- **Source:** [phase-4-review-followups.md](plans/phase-4-review-followups.md)
- **Why deferred:** No e2e harness in the repo yet. Standing one up (Playwright config + CI job + first spec) is ~a few hours and unblocks the deferred Phase 4 smoke plus future smokes (Phase 6 metered scenario → quote).

## MCP

### Service-account (machine-to-machine) tokens

- **Source:** [v2 MCP server design](specs/2026-04-21-v2-mcp-server-design.md) (Non-Goals)
- **Why deferred:** Every v2 token is user-owned. With HubSpot integration live, there may now be a concrete use case for non-user-bound tokens — worth revisiting.

### Rate limiting / IP allowlists on `/api/mcp`

- **Source:** [v2 MCP server design](specs/2026-04-21-v2-mcp-server-design.md) (Non-Goals)
- **Why deferred:** "Revisit if abuse signals appear." No abuse signals observed to date.

### MCP resources / streaming

- **Source:** [v2 MCP server design](specs/2026-04-21-v2-mcp-server-design.md) (Non-Goals)
- **Why deferred:** All data access modeled as tools for uniformity; no large-payload or long-running tools today.
