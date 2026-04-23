# Ninja Pricer v2 — Phase 6: Omni Products + Metered SaaS — Design Spec

> Scoped for v2, post-MCP. Addresses the "Additional SaaS products" item deferred from the [v1 design](./2026-04-17-ninja-pricer-v1-design.md) ("Out of v1") and tracked in [docs/superpowers/backlog.md](../backlog.md).

## Overview

Stand up two new SaaS products — **Omni Sales** and **Omni Concierge** — and introduce a **metered revenue model** to the pricing engine. Omni Sales reuses the existing per-seat primitives and is delivered as catalog-entry only. Omni Concierge introduces a new `METERED` revenue model: monthly committed fee, included units per month, overage rate per unit, vendor cost per unit. Setup fees for both products continue to be expressed via bundles (SaaS product + Training / White-glove / Service lines), not a new SaaS primitive.

All existing per-seat scenario flows (Ninja Notes today, Omni Sales once seeded) remain byte-for-byte unchanged. Metered scenarios run through a new engine path selected by a `revenueModel` discriminator on `Product`.

## Goals

- An admin can stand up **Omni Sales** end-to-end via the existing admin UI and MCP catalog tools, with no engine changes.
- An admin can stand up **Omni Concierge** with a single `MeteredPricing` record (unit label, included units, committed monthly fee, overage rate, cost per unit) and standard fixed costs, contract modifiers, and rails.
- A sales rep can build a scenario combining Ninja Notes (per-seat), Omni Concierge (metered), and Training/Service (labor), see correct margin + rail warnings in the summary rail, and generate a customer-facing quote PDF plus admin internal-summary PDF.
- HubSpot catalog-sync and quote-publish translators understand metered products and emit line items that reconcile with the pricer's frozen `Quote` totals.

## Non-Goals

- Renaming or restructuring existing products (Ninja Notes stays Ninja Notes).
- Historical rate-card versioning — still deferred (see backlog).
- Volume discount tiers on committed units (metered) — deferred.
- A `MIN_MONTHLY_FEE` rail kind — deferred.
- Multiple cost types per metered product (voice vs. chat, peak vs. off-peak) — deferred.
- Setup fee as a first-class SaaS primitive — confirmed to stay as a bundle pattern.
- Auto-costing labor SKUs from department rates — orthogonal, deferred.
- Playwright e2e smoke — deferred until the e2e harness lands (see [phase-4-review-followups.md](../plans/phase-4-review-followups.md)).

## Scope

**Two new products:**

1. **Omni Sales** — `kind = SAAS_USAGE`, `revenueModel = PER_SEAT`. Uses existing primitives (vendor rates, personas, list price, volume tiers, contract modifiers). Setup fee delivered via a bundle combining Omni Sales + Training/Service labor lines. **No engine changes.**

2. **Omni Concierge** — `kind = SAAS_USAGE`, `revenueModel = METERED`. Introduces the metered primitive. Setup fee also delivered via bundle.

**Phase deliverable:** Both products stood up in admin; a mixed scenario (Notes per-seat + Concierge metered + Training labor) computes correctly, shows accurate rail warnings, and generates a reconciled quote PDF + HubSpot line items.

## Architecture

### Schema changes (single Prisma migration)

**New enum:**

```prisma
enum SaaSRevenueModel {
  PER_SEAT
  METERED
}
```

**`Product` — add one column:**

```prisma
revenueModel SaaSRevenueModel @default(PER_SEAT)
```

Only meaningful when `kind = SAAS_USAGE`. Labor kinds default to `PER_SEAT` and it is ignored downstream.

**New table — `MeteredPricing` (1:1 with `Product`):**

```prisma
model MeteredPricing {
  id                     String  @id @default(cuid())
  productId              String  @unique
  unitLabel              String
  includedUnitsPerMonth  Int
  committedMonthlyUsd    Decimal @db.Decimal(18, 4)
  overageRatePerUnitUsd  Decimal @db.Decimal(18, 6)
  costPerUnitUsd         Decimal @db.Decimal(18, 6)
  product                Product @relation(fields: [productId], references: [id], onDelete: Cascade)
}
```

**`ScenarioSaaSConfig` — add two nullable columns:**

```prisma
committedUnitsPerMonth      Int?
expectedActualUnitsPerMonth Int?
```

**Invariants enforced at service layer (not DB):**

- `METERED` products must have a `MeteredPricing` row; must not have `ListPrice`, `VolumeDiscountTier`, `Persona`, `OtherVariable`, or `BaseUsage` rows.
- `PER_SEAT` products must have a `ListPrice` row (existing rule); must not have a `MeteredPricing` row.
- `revenueModel` is immutable once any `Scenario` references the product or any `MeteredPricing`/`ListPrice` exists.
- Rail kinds `MAX_DISCOUNT_PCT` and `MIN_SEAT_PRICE` cannot be attached to `METERED` products.
- For a scenario's SaaS config: `committedUnitsPerMonth` + `expectedActualUnitsPerMonth` are present iff the referenced product is `METERED`, null iff `PER_SEAT`.

### Engine changes

The top-level `computeSaaSTab` in `lib/engine/` dispatches on `product.revenueModel`:

- `PER_SEAT` → existing `computePerSeatSaaSTab`, unchanged.
- `METERED` → new `computeMeteredSaaSTab`.

**Metered compute inputs:**

```
MeteredPricingSnapshot:
  includedUnitsPerMonth, committedMonthlyUsd,
  overageRatePerUnitUsd, costPerUnitUsd, unitLabel
ContractLengthModifier[]      (reused)
ProductFixedCost[]            (reused, monthly)
ScenarioMeteredInputs:
  committedUnitsPerMonth       (defaults to includedUnitsPerMonth)
  expectedActualUnitsPerMonth  (defaults to committedUnitsPerMonth; sales rep forecast)
  contractMonths
```

**Revenue (per month):**

```
contractDiscountPct = max contractModifier where contractMonths ≥ minMonths (else 0)
discountedCommitted = committedMonthlyUsd × (1 - contractDiscountPct)

overageUnits   = max(0, expectedActualUnitsPerMonth - includedUnitsPerMonth)
overageRevenue = overageUnits × overageRatePerUnitUsd       // NOT discounted

monthlyRevenue = discountedCommitted + overageRevenue
```

**Decision locked:** contract-length discount applies only to the committed fee, not overage. Reasoning: overage is by definition off-commitment; customers and sellers negotiate the monthly deal, not the overage rate.

**Cost (per month):**

```
usageCost    = expectedActualUnitsPerMonth × costPerUnitUsd
fixedCost    = Σ ProductFixedCost.monthlyUsd
monthlyCost  = usageCost + fixedCost
```

No vendor rates, base usage, other variable, or persona multipliers — all per-seat concepts.

**Contract total:** `(monthlyRevenue - monthlyCost) × contractMonths` — same roll-up as per-seat.

**Rails — METERED coverage:**

| Rail kind | Behavior for METERED |
|---|---|
| `MIN_MARGIN_PCT` | Works unchanged. |
| `MIN_CONTRACT_MONTHS` | Works unchanged. |
| `MAX_DISCOUNT_PCT` | N/A — service layer rejects attachment. |
| `MIN_SEAT_PRICE` | N/A — service layer rejects attachment. |

### Services + MCP tools

**`lib/services/product.ts`:**
- `createProduct({ kind, revenueModel? })` — `revenueModel` only accepted when `kind = SAAS_USAGE`; defaults `PER_SEAT`.
- `updateProduct` — rejects `revenueModel` change if any scenario references the product or any `MeteredPricing`/`ListPrice` exists.
- Rail-attach methods reject `MAX_DISCOUNT_PCT` and `MIN_SEAT_PRICE` on `METERED` products.
- `ListPrice`/`VolumeDiscountTier`/`Persona`/`OtherVariable`/`BaseUsage` mutation methods reject on `METERED` products.

**New service — `lib/services/meteredPricing.ts`:**
- `getMeteredPricing(productId)` — read.
- `setMeteredPricing(productId, { unitLabel, includedUnitsPerMonth, committedMonthlyUsd, overageRatePerUnitUsd, costPerUnitUsd })` — upsert; one row per product.

**Scenario service:**
- `set_scenario_saas_config` accepts `committedUnitsPerMonth` + `expectedActualUnitsPerMonth`; validates present/null based on referenced product's `revenueModel`.

**New MCP tools (Phase 5.2 pattern — admin-only, `isWrite`, audited):**
- `set_metered_pricing` — upsert.
- `get_metered_pricing` — read (sales + admin).

Existing catalog tools (`create_product`, `update_product`, bundle tools, rail tools, commission tools) transparently handle metered products via service-layer validation. Existing read tools (`get_product`, `list_products`, `get_scenario`, `get_scenario_compute`) gain the new optional fields — additive, non-breaking.

### Admin UI

**Product create** (`/admin/products/new`):
- New **Revenue model** dropdown, shown only when `kind = SAAS_USAGE`. Options: `Per-seat` (default) / `Metered`. Disabled after creation.

**Product detail** (`/admin/products/[id]`):
- `PER_SEAT` products — all existing sections (Vendor Rates, Base Usage, Personas, Other Variable, List Price, Volume Tiers, Active Users @ Scale, Contract Modifiers, Fixed Costs, Rails). No change.
- `METERED` products — hides Vendor Rates, Base Usage, Personas, Other Variable, List Price, Volume Tiers, Active Users @ Scale. Keeps Fixed Costs, Contract Modifiers, Rails. Adds a new **Metered Pricing** section.

**Metered Pricing section** — single form, single row: `unitLabel`, `includedUnitsPerMonth`, `committedMonthlyUsd`, `overageRatePerUnitUsd`, `costPerUnitUsd`, Save button → `setMeteredPricing`.

**Rail editor** — when attaching a rail to a `METERED` product, only `MIN_MARGIN_PCT` and `MIN_CONTRACT_MONTHS` appear in the kind dropdown.

Bundles editor and products list — no changes.

### Sales UI

One scenario-builder tab per configured SaaS product, same as today. Tab renders conditionally on `product.revenueModel`:

**`PER_SEAT`** — unchanged (seats, persona sliders, contract months, live per-seat + vendor breakdown).

**`METERED`** — new layout:
- `Committed units / month` (defaults to `includedUnitsPerMonth`, editable).
- `Expected actual usage / month` (defaults to `committedUnitsPerMonth`).
- `Contract months`.
- Read-only live summary: committed monthly (with contract discount), expected overage × overage rate, total monthly revenue, monthly cost breakdown, monthly margin, contract totals.

Left summary rail aggregates across tabs unchanged. Rail warnings follow today's treatment (sales sees neutral text, admin sees thresholds). `MIN_SEAT_PRICE` / `MAX_DISCOUNT_PCT` warnings never fire on metered tabs.

Bundle apply unchanged: a bundle like "Omni Concierge Starter" can pre-populate a metered tab (committed + expected) alongside a labor tab (setup hours) in one click.

### Quote / PDF

**Customer-facing PDF** — new line-item block for metered tabs:

```
Omni Concierge — 36-month term
  Monthly base (5,000 minutes included)    $2,500.00
  Overage rate                             $0.50 / minute
  Contract discount (36-mo)                     -10%
  Effective monthly base                   $2,250.00

Expected monthly total (based on forecast usage of 6,200 min)
  Base + 1,200 overage minutes × $0.50     $2,850.00

Contract total (36 months, at expected usage)  $102,600.00
```

Fields disclosed as a forecast, not a guarantee.

**Internal-summary PDF (admin-only)** — adds `costPerUnit`, monthly cost, monthly margin $, margin %.

**Mixed scenarios** render per-seat tabs in today's format and metered tabs in the new format, in scenario order. Labor tabs unchanged.

`Quote` frozen totals — no schema change; rendering layer reads the new fields off the computed result at generation time.

### HubSpot integration

Translator updates in `lib/hubspot/catalog/translator.ts` and `lib/hubspot/quote/translator.ts`:

- **Catalog push** — `METERED` products sync as HubSpot products with `committedMonthlyUsd` as the recurring price plus a linked companion product representing overage (unit price = `overageRatePerUnitUsd`). Unit label flows into a HubSpot custom property.
- **Quote publish** — a metered tab serializes as two HubSpot line items: one recurring (committed), one usage (expected overage). Totals reconcile with the frozen `Quote` snapshot.
- **Approval webhooks** — no changes.

One task in this phase: translator updates + fixture for a mixed scenario.

## Data Model Additions

Summarized from Architecture → Schema above. One migration, one new enum, one new table, three new columns.

## Risks

- **HubSpot line-item shape.** HubSpot may not cleanly support "committed + overage" as two linked items. Mitigation: unit-test translator with fixtures before wiring to live API; adjust model if HubSpot forces a different shape.
- **Missing usage forecast.** Leaving `expectedActualUnitsPerMonth` at 0 produces an optimistic zero-cost scenario. Mitigation: default to `committedUnitsPerMonth` on scenario create and surface a validation warning if the rep zeros it out.

## Testing

- **Engine:** new golden fixtures — (a) usage under included, (b) usage over included, (c) contract-length discount on committed only, (d) `MIN_MARGIN_PCT` rail eval, (e) mixed scenario with per-seat + metered + labor. Existing per-seat goldens must remain byte-identical.
- **Services:** unit tests for the immutable `revenueModel`, rail-kind gating, `ListPrice` rejection on `METERED`, `MeteredPricing` required on `METERED` create.
- **MCP:** protocol conformance for `set_metered_pricing` + `get_metered_pricing` (admin gating, audit row emission).
- **HubSpot:** translator unit tests + fixture for a metered line item.
- **UI:** component tests for conditional rendering on product detail + scenario builder.
- **Playwright smoke:** deferred to e2e harness work.

## Migration + Rollout

Single Prisma migration (enum + column + table + two nullable scenario columns). No data backfill. `prisma/seed.ts` extended to seed `Omni Sales` (`PER_SEAT`) and `Omni Concierge` (`METERED`) as inactive shells so dev envs have templates. Production catalog entry happens via admin UI or MCP after deploy.

## Out of Scope → Backlog

These are captured in [docs/superpowers/backlog.md](../backlog.md):

- Volume discount tiers on committed units (metered).
- `MIN_MONTHLY_FEE` rail kind.
- Multiple cost types per metered product (voice vs. chat, peak vs. off-peak).
- Historical rate-card versioning.
- Scenario sharing / collaboration.
- Staging environment.
- Auto-costing labor SKUs from department rates.
- Playwright e2e harness + deferred Phase 4 smoke.
- MCP service-account tokens, rate limiting, resources/streaming.
