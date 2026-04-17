# Ninja Pricer v1 — Design

**Date:** 2026-04-17
**Status:** Design approved, pending final written-spec review

## Purpose

An internal cost-and-pricing simulator for Ninja Concepts' sales team. Sales reps build scenarios ("workups") for prospective customers; the tool computes cost, revenue, contribution margin, commissions, and net margin, and flags deals that fall below admin-set rails.

V1 covers Ninja Notes (SaaS, usage-driven cost), a Training & White-glove tab (packaged labor SKUs), and a Service tab (ad-hoc custom labor). The system is architected so adding Omni, Concierge, and Sales as additional SaaS products later is configuration, not a rewrite. An MCP interface (for Cowork / HubSpot) is deferred to v2; the pricing engine is built as a pure module so an MCP server can consume the same logic.

## V1 Scope

**In v1:**

- Three product tabs: Notes (SaaS usage-based), Training & White-glove (packaged labor), Service (ad-hoc custom labor).
- Cost model: vendor-metric-driven (Deepgram $/min, LLM $/M tokens, LiveKit, S3, Memo, etc.) with a catch-all "other variable $/user" bucket.
- Personas: per-product usage intensity multipliers; deal-level seat-mix percentage.
- Fixed cost allocation: per-product, computed as `Σ(fixed cost items) / active-user count`.
- Revenue: list price × volume discount tier × contract-length modifier; monthly output × contract-length multiplier.
- Employees, burdens (FICA, FUTA, SUTA, health, etc.), departments with computed loaded rates and admin-set bill rates.
- Commission rules with progressive tiers, scoped by product or department, based on revenue or margin.
- Bundles: named templates that pre-fill line items across one or more tabs.
- Admin rails: per-product, multi-kind (min margin %, max discount %, min seat price, min contract months), tiered severity (soft warn / hard block with admin override).
- Microsoft 365 SSO; admin vs. sales roles.
- Quote history via persisted PDF artifacts (immutable per-version).
- PDF generation for customer-facing quotes; internal summary PDF with costs/margins for admins.
- Postgres for all persistent data.
- Deployment to Railway.

**Out of v1 (future):**

- MCP server / Cowork / HubSpot integration.
- Additional SaaS products (Omni, Concierge, Sales).
- Rate-card historical versioning (history comes from saved PDFs).
- Multi-environment (staging) — single prod env to start.
- Scenario sharing / collaboration.
- Auto-costing labor SKUs from department rates.

## Architecture

Single Next.js app on Railway + Railway-managed Postgres. Next.js app router with server actions for mutations and typed endpoints for reads. Prisma ORM. NextAuth with Microsoft Entra ID provider (domain-allowlisted). Object storage (Railway volume or S3-compatible bucket) for PDFs.

### Code layout

```
/app                 Next.js routes & server actions
/components          React UI
/lib
  /engine            Pure pricing engine: no DB, no IO, framework-free.
  /db                Prisma client, repositories.
  /services          Domain services (orchestrate engine + repositories).
  /auth              NextAuth config, role helpers.
/prisma/schema.prisma
/tests
```

**Load-bearing rule:** `lib/engine` is pure. It takes plain data (scenario inputs plus a full snapshot of rates, personas, bundles, rails, commissions) and returns plain data (cost, revenue, margin, warnings). The web UI and the future MCP server both consume the engine through services. Services fetch via repositories, call the engine, persist results.

### Deployment

Railway service + Railway Postgres + object storage for PDFs. Single production environment at launch. Prisma Migrate applied on deploy.

## Data Model (Postgres)

Entities grouped by purpose.

### Identity

- `User` — email, name, `role` (`ADMIN` | `SALES`), Microsoft SSO subject.

### Product catalog (admin-owned)

- `Product` — name, `kind` (`SAAS_USAGE` | `PACKAGED_LABOR` | `CUSTOM_LABOR`), is_active. V1 seeds three rows: Notes (SaaS), Training & White-glove (packaged labor), Service (custom labor). Adding Omni later = a new row with `kind = SAAS_USAGE`.

#### For `SAAS_USAGE` products (Notes, future Omni/Concierge/Sales):

- `VendorRate` — belongs to a product. Name, unit label, USD rate. E.g., "Deepgram Nova-2" at $0.0043/min; "OpenAI GPT-4o input" at $2.50/M tokens.
- `BaseUsage` — per `(product_id, vendor_rate_id)`: usage-per-avg-user-per-month. Defines the "1×" persona baseline.
- `OtherVariable` — per product, flat USD/user/month catch-all for small variable costs not individually modeled.
- `Persona` — per product, name + multiplier (e.g., "Light" 0.3×, "Average" 1×, "Heavy" 3×). Multiplier scales the base usage and `OtherVariable`.
- `ProductFixedCost` — per product, named line items (EC2, PostHog, Sentry, etc.) in monthly USD.
- `ProductScale` — per product, current-active-user count across the whole book. Engine derives `infra_per_user = Σ(ProductFixedCost) / active_users`.
- `ListPrice` — per product, USD/seat/month list rate.
- `VolumeDiscountTier` — per product, min_seats → discount %. Engine picks the largest tier whose threshold is met.
- `ContractLengthModifier` — per product, min_months → additional discount %. Same largest-match rule.

#### For `PACKAGED_LABOR` products (Training & White-glove):

- `LaborSKU` — name, `unit` (`PER_USER` | `PER_SESSION` | `PER_DAY` | `FIXED`), cost_per_unit, default_revenue_per_unit. Admin-entered cost for v1.

#### For `CUSTOM_LABOR` products (Service):

- `Department` — name, is_active. (e.g., Engineering, Training, Marketing, Sales, Support.)
- Service labor line items reference a department directly. Hours × department loaded rate (cost) and bill rate (revenue).

### Labor & burdens

- `Burden` — named overhead loaded onto labor. Fields: name, rate_pct, cap_usd (nullable, for things like FUTA's $7k cap), scope (`ALL_DEPARTMENTS` or specific department).
- `Employee` — name, department_id, compensation (`annual_salary` or `hourly_rate` + `standard_hours_per_year`), is_active.
- `DepartmentBillRate` — department_id, bill_rate_per_hour (admin-set). Department surface also shows the *computed* avg loaded rate (blended from active employees with burdens applied).

### Commissions

- `CommissionRule` — name, `scope_type` (`ALL` | `PRODUCT` | `DEPARTMENT`), `scope_id` (nullable — product_id or department_id depending on scope_type), base_metric (`REVENUE` | `CONTRIBUTION_MARGIN` | `TAB_REVENUE` | `TAB_MARGIN`), recipient_employee_id (optional, for display/reporting), notes, is_active.
- `CommissionTier` — rule_id, threshold_from_usd, rate_pct. Progressive/marginal application (e.g., 10% on first $100k, 15% on the next band). Single-tier rules have one tier starting at 0.

### Bundles

- `Bundle` — name, description, is_active.
- `BundleItem` — bundle_id, product_id, config JSONB. For SaaS: seat count, persona mix, discount override. For labor: SKU reference + qty, or department + hours. Applying a bundle writes these configs into scenario tabs; the scenario doesn't stay coupled to the bundle afterward (applied_bundle_id is informational).

### Rails

- `Rail` — per-product, `kind` (`MIN_MARGIN_PCT` | `MAX_DISCOUNT_PCT` | `MIN_SEAT_PRICE` | `MIN_CONTRACT_MONTHS`), `margin_basis` (`CONTRIBUTION` | `NET`; only meaningful when `kind = MIN_MARGIN_PCT`, ignored otherwise), soft_threshold, hard_threshold, is_enabled.

### Workup (what sales creates)

- `Scenario` — customer_name, owner_id (User), contract_months, applied_bundle_id (nullable, informational), notes, is_archived, created_at, updated_at.
- `ScenarioSaaSConfig` — scenario_id, product_id, seat_count, persona_mix JSONB (array of `{persona_id, pct}` summing to 100), discount_override_pct (nullable).
- `ScenarioLaborLine` — scenario_id, product_id, sku_id (nullable, for packaged), department_id (nullable, for custom), custom_description (nullable), qty, unit, cost_per_unit_usd, revenue_per_unit_usd, sort_order.

### Quote artifacts

- `Quote` — scenario_id, version (sequential per scenario), pdf_url, internal_pdf_url (nullable), generated_at, generated_by_id, customer_snapshot JSONB, totals JSONB (full frozen computation output). Immutable once generated.

## Pricing Engine

Location: `lib/engine/`. Pure TypeScript — no DB, no framework imports.

### Input

```
ComputeRequest {
  contract_months
  tabs: [
    SaasTab { product, seat_count, persona_mix, discount_override? }
    PackagedLaborTab { product, line_items: [{ sku | custom, qty, unit, unit_cost, unit_revenue }] }
    CustomLaborTab { product, line_items: [{ department_id, hours }] }
  ]
  rates: { vendor_rates, base_usage, other_variable, personas,
           product_fixed_costs, product_scale, list_prices,
           volume_tiers, contract_modifiers, labor_skus,
           departments_with_loaded_and_bill_rates }
  commission_rules: [{ rule, tiers }]
  rails: [...]
}
```

### Per-SaaS-tab computation

Let `M = Σ over personas (pct/100 × persona.multiplier)` — the mix-weighted average persona multiplier for this tab.

Let `base_variable_per_user = Σ over vendor_rates (base_usage × vendor_rate) + other_variable`.

1. Variable cost per seat per month = `M × base_variable_per_user` (because each persona scales all usage metrics and the other-variable bucket by its own multiplier; the mix-weighted average is equivalent to summing per persona).
2. Infra cost per seat per month = `Σ(product fixed costs) / product active-user count`. Not scaled by persona — infra is per active user regardless of intensity.
3. Total cost per month = `seats × (variable + infra)`.
4. Gross list revenue per month = `seats × list_price`.
5. Volume discount % = tier where `seat_count ≥ min_seats` (largest match).
6. Contract discount % = tier where `contract_months ≥ min_months` (largest match).
7. Effective discount % = `volume_disc + contract_disc`, overridden by `discount_override` if present.
8. Net revenue per month = `list_revenue × (1 − effective_discount)`.
9. Contribution margin per month = `net_revenue − total_cost`.

### Per-packaged-labor tab

`Σ(qty × unit_cost)` vs. `Σ(qty × unit_revenue)`. **Treated as one-time in v1**: labor revenue and cost are counted once per contract, not repeated per month. If a deal legitimately needs recurring labor (e.g., ongoing managed training), sales adds the total qty for the contract term.

### Per-custom-labor tab (Service)

`Σ(hours × dept.loaded_rate)` vs. `Σ(hours × dept.bill_rate)`. One-time, same v1 treatment as packaged labor.

### Aggregation

- Monthly totals = sum of recurring (SaaS) tabs.
- Contract total = `monthly × contract_months + one-time totals`.
- Contribution margin (contract) = total revenue − total cost.
- Commissions: for each rule, resolve base metric (`TAB_REVENUE` or `TAB_MARGIN` for the scoped product/department, or cross-tab `REVENUE` / `CONTRIBUTION_MARGIN`). Apply tiers progressively.
- Net margin = contribution margin − Σ commissions.

### Rail evaluation

For each enabled rail, compute the measured value (margin % on chosen basis, discount %, seat price, contract months). Compare against soft and hard thresholds, emit warnings with severity, rule name, measured value, and threshold.

### Output

```
ComputeResult {
  per_tab: [{ tab_id, monthly_cost, monthly_revenue,
              one_time_cost, one_time_revenue,
              contract_cost, contract_revenue,
              contribution_margin }]
  totals: { monthly_cost, monthly_revenue,
            contract_cost, contract_revenue,
            contribution_margin, net_margin, margin_pct }
  commissions: [{ rule_id, name, base_amount, commission_amount, tier_breakdown }]
  warnings: [{ rail_id, severity: 'soft' | 'hard',
               message, measured, threshold }]
  breakdown: { /* per-seat per-vendor detail for UI visualization */ }
}
```

### Design principles

- Pure functions. Deterministic given same input. No randomness, no time-dependent calls.
- All monetary values in integer cents to avoid floating-point drift; the UI formats for display.
- Engine receives a full rate snapshot; it does not fetch. Makes unit testing trivial and keeps MCP consumption clean.

## UI Surfaces

### Sales side

**Top nav:** My Scenarios · Bundles · Admin (if admin) · user menu.

**`/scenarios`** — list page with table (name, customer, contract length, last updated, status, owner, net margin %). Filters by owner (admin sees all), status, customer. "New scenario" button.

**`/scenarios/[id]`** — builder:

- **Header:** scenario name, customer name, contract months, "Apply bundle" dropdown, "Save" / "Generate Quote" / "Archive".
- **Sticky left rail:** contract total revenue, contract total cost, contribution margin $, commission allocation $, net margin $ and %, rail warnings (red/yellow banners with rule names). Live-updates as inputs change.
- **Main tab area:**
  - **Notes tab:** seat count, persona mix sliders with 100% sum check, live per-seat breakdown (variable, infra, list, discount, net, margin %), collapsible vendor-level breakdown.
  - **Training & White-glove tab:** "Add from SKU" picker; custom line item form; line-item table; cost column hidden from sales-only view.
  - **Service tab:** "Add labor" with department picker; hours × department bill rate = revenue per line. Cost not line-itemized to sales; rolled-up margin shows in the sticky summary.
- **Bundle apply:** writes tab configs in place, sets `applied_bundle_id` for display. Sales can edit afterward.

### Admin side

`/admin` — sidebar nav grouped:

- **Products** (`/admin/products`, `/admin/products/[id]/…`): Vendor rates · Base usage · Other variable · Personas · Fixed costs + active-user scale · List price + volume tiers + contract modifiers · Rails.
- **Labor SKUs** — training/white-glove catalog.
- **Departments** — list with computed loaded rate (admin-only), admin-set bill rate; drill in for employees.
- **Employees** — CRUD, compensation, department.
- **Burdens** — FICA/FUTA/SUTA/etc. with caps.
- **Commissions** — rules + tiers.
- **Bundles** — name + items (SaaS configs and/or labor references).
- **Users** — invite by email, set role. Microsoft SSO verifies on first login.

### Permissioning

- **Admin:** sees and edits everything.
- **Sales:** creates/edits their own scenarios; reads other scenarios; picks from bundles and products; **cannot** see employee compensation, loaded rates, burdens, commission rules, or rail thresholds. Rail warnings surface with neutral text ("below approved floor — requires admin review") rather than raw threshold values.

## Quote Artifacts & PDF

### Flow

1. Sales clicks "Generate Quote".
2. Server re-runs the engine with current rates.
3. Renders PDF, uploads to object storage, creates a `Quote` row with sequential version, PDF URL, generator, snapshot, totals.
4. Builder shows "Quote v3 generated" with download.

### PDF content

**Customer-facing:** header (customer name, date, quote version), per-tab section (what's being bought — seats, line items, qty × revenue), contract length, total contract value, terms footer. **No costs or margins.**

**Internal summary (optional, admin-only download toggle):** same doc plus cost breakdown, margin %, commissions.

### Tech

`react-pdf` — programmatic, deterministic layout. Rejected Puppeteer because byte-deterministic output matters for business documents.

### Quote list

`/scenarios/[id]/quotes` — version, date, generator, totals snapshot, download link. Immutable once generated.

## MCP v2 Readiness

Deferred but architected for:

- Engine is a pure TS module already imported by services. An MCP server (separate Railway service or an embedded route) imports the same `lib/engine` and `lib/services`.
- Intended tools: `list_products`, `list_bundles`, `list_personas_for_product`, `compute_quote` (inputs → results, no persistence), `create_scenario`, `generate_quote_pdf`.
- Auth via per-user API tokens (`ApiToken` table: id, user_id, token_hash, label, last_used_at) — added when MCP lands.
- Cowork & HubSpot callers use these tools; no logic duplication.

## Validation, Errors, Observability

- **Validation:** Zod schemas at the server-action/API boundary; the engine re-validates core invariants as defense in depth.
- **Key rules:** persona mix sums to 100%; seat count ≥ 0; contract months > 0; commission tier thresholds non-decreasing; burden rates ≥ 0; volume/contract tiers' thresholds non-decreasing.
- **Error handling:** services throw typed errors (`NotFoundError`, `ValidationError`, `RailHardBlockError`); API layer maps to HTTP; UI shows human messages.
- **Observability:** Sentry for errors, Railway's built-in logs, structured JSON logs on the server. Not over-built — internal tool scale.

## Testing Strategy

Prioritized:

1. **Engine unit tests (heavy investment).** Golden-scenario fixtures: known inputs produce known outputs at the cent level. Any rate/tier/formula regression is caught immediately.
2. **Service integration tests** against a test Postgres (Docker in CI or Testcontainers). Scenario CRUD, bundle apply, rail evaluation, quote generation (stub PDF renderer).
3. **UI smoke tests (Playwright, small set).** Login → create scenario → apply bundle → generate PDF. Catches routing/auth breakage.
4. Skip exhaustive UI component tests for v1 — the calculator is mostly forms, and engine + service tests cover correctness.

## Deployment & Secrets

- **Railway:** one web service, managed Postgres, Railway volume (or S3-compatible bucket) for PDFs.
- **Env vars:** `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `MICROSOFT_ENTRA_TENANT_ID`, `MICROSOFT_ENTRA_CLIENT_ID`, `MICROSOFT_ENTRA_CLIENT_SECRET`, object-storage creds, `SENTRY_DSN`, `SEED_ADMIN_EMAIL`.
- **Migrations:** `prisma migrate deploy` in the Railway start command.
- **Seed script:** creates the initial admin from `SEED_ADMIN_EMAIL`, seeds FICA/FUTA/typical-SUTA burdens with defaults, seeds the three v1 products with placeholder rates an admin then tunes.
- **Single environment (production)** at launch. Staging can be added when the team grows or schema changes become risky.

## Open Questions / Assumptions

- **Commission tiers apply progressively (marginal).** If the business runs flat-by-tier commissions ("whole deal hits the bracket's rate"), the engine needs a small adjustment.
- **Sales-visible cost on Service tab.** Sales sees tab total revenue and the rolled-up scenario margin, not per-line cost. If that turns out to be confusing (reps want to see "this labor line costs $X"), expose a cost column gated behind a user setting.
- **PDF storage.** Railway volume vs. S3-compatible bucket is a deployment detail decided at build time; either works.
- **Customer entity.** V1 stores customer name as a string on the scenario. Promoting to a `Customer` entity (with a HubSpot contact link) is a clean future migration when HubSpot integration lands.
