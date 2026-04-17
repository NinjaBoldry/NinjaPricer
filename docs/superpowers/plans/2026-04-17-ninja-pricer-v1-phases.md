# Ninja Pricer v1 — Phase Roadmap

> **Spec:** [docs/superpowers/specs/2026-04-17-ninja-pricer-v1-design.md](../specs/2026-04-17-ninja-pricer-v1-design.md)

This document captures the phased implementation strategy for Ninja Pricer v1. Each phase produces working, testable software. Detailed task-by-task plans are written per-phase, in sequence, so later phases can absorb learnings from earlier ones.

**Global principles (apply to every phase):**

- TDD. Test first, then implement. Golden-fixture tests for the engine; integration tests for services; Playwright smoke tests for UI.
- Small commits. One task = one commit in most cases.
- `lib/engine` stays pure. No DB imports, no Next.js imports. Ever.
- Money in integer cents throughout the engine. UI formats for display.
- Follow patterns established in Phase 1 in all subsequent phases (folder conventions, test style, error types).

---

## Phase 1 — Foundation + Engine

**Goal:** Working scaffolded app with login, role-protected route shells, a complete DB schema ready for later CRUD, and a fully unit-tested pure pricing engine.

**Scope:**
- Next.js 14 app router, TypeScript strict, ESLint, Prettier, Vitest.
- Railway-ready Postgres + Prisma ORM with the full v1 schema migrated (all entities from the spec).
- NextAuth with Microsoft Entra provider, domain-allowlisted, admin vs. sales role on User.
- Admin seeded from `SEED_ADMIN_EMAIL` on first boot.
- Role-routed shell: `/` redirects to `/scenarios`; `/admin/*` requires admin role; `/scenarios/*` requires auth.
- Engine (`lib/engine/`) — pure TypeScript, takes `ComputeRequest`, returns `ComputeResult`. Covers: SaaS tab compute (variable/infra/volume/contract/discount/margin), packaged-labor tab, custom-labor tab, progressive-tier commission evaluation, rail evaluation, aggregation.
- Golden fixtures: realistic end-to-end scenarios with known expected outputs.
- GitHub Actions CI: typecheck, lint, unit tests, migration check.
- Logging utility, typed-error module.

**Deliverable:** The foundation is trustworthy. You can log in, see role-appropriate shells, the DB is ready for features to be built on top, and the math engine has been proven correct in isolation.

**Key decisions locked here (don't revisit in later phases):**
- Folder layout under `/lib` (engine / db / services / auth).
- Error type hierarchy (`NotFoundError`, `ValidationError`, `RailHardBlockError`).
- Test fixture patterns.
- Money-as-cents discipline.
- Zod schema location conventions.

---

## Phase 2 — Admin UI

**Goal:** Admin can fully configure the product catalog and all associated data — vendor rates, personas, costs, pricing, labor, employees, burdens, commissions, bundles, rails.

**Scope:**
- `/admin` layout + sidebar nav.
- **Products** index + detail pages. Per-product sub-sections: vendor rates, base usage, other variable, personas, fixed costs, active-user scale, list price, volume tiers, contract modifiers, rails.
- **Labor SKUs** CRUD.
- **Departments** list (with computed loaded rate visible) + admin-set bill rate. Drill-in to assigned employees.
- **Employees** CRUD, compensation, department.
- **Burdens** CRUD with caps.
- **Commissions** — rules + tiers editor.
- **Bundles** — name + items editor (SaaS configs, labor SKU refs, department/hours refs).
- **Users** — invite by email, set role.
- Services layer (`lib/services`) and repositories (`lib/db`) built out for each admin domain. All admin mutations go through services with Zod validation at boundary and typed error mapping.
- Admin-only route middleware enforced server-side + UI elements hidden for sales role.

**Deliverable:** Admin can fully stand up the system: add a product, configure all its rate cards, add employees/burdens that feed department loaded rates, set commission rules, define bundles, and set rails.

**Dependencies on Phase 1:** DB schema, auth, role helpers, typed-error module, Zod conventions.

**Deferred to later phases:** All of these admin screens read/write data but don't need the engine *yet* (it's already testable standalone). The sales UI in Phase 3 is where engine + services + UI come together.

---

## Phase 3 — Sales UI + Scenarios

**Goal:** Sales users can create scenarios, configure tabs, apply bundles, and see live-updating margin summaries with rail warnings.

**Scope:**
- `/scenarios` list page with filters (owner, status, customer).
- `/scenarios/[id]` builder page:
  - Header (name, customer, contract months, bundle apply, save, generate-quote stub, archive).
  - Sticky left summary rail (contract totals, contribution margin, commission allocation, net margin, rail warnings).
  - Notes tab: seat count, persona mix sliders (100% sum enforcement), live per-seat breakdown, vendor-level breakdown panel.
  - Training & White-glove tab: SKU picker, custom line item, table with cost hidden from sales.
  - Service tab: department picker + hours, revenue visible, cost hidden from sales.
- Bundle application: writes into scenario configs, sets `applied_bundle_id` informationally.
- Scenario CRUD services (create, update, list, archive).
- Live recalc: client hits a compute endpoint that assembles the rate snapshot, calls the engine, returns the result. Debounced so slider drags don't hammer.
- Permissioning: sales sees tab cost hidden; rail warnings show neutral "below approved floor — requires admin review" text for sales, raw thresholds for admin.
- Playwright smoke: login → new scenario → apply bundle → see margin.

**Deliverable:** Sales can run the whole workup flow except the final PDF export.

**Dependencies on Phase 1 & 2:** Engine, auth, full product catalog with admin-entered rates, bundles, rails, commissions.

---

## Phase 4 — Quotes & PDFs

**Goal:** Sales can generate customer-facing quote PDFs; admin can pull internal summaries with costs and margins. Quote history is immutable and persisted.

**Scope:**
- `react-pdf` templates: customer quote + internal summary variants.
- Object storage wiring (Railway volume or S3-compatible — decide at implementation time).
- `Quote` entity write path: re-run engine, render PDF, upload, create row with sequential version + frozen totals snapshot.
- `/scenarios/[id]/quotes` history page with version, date, generator, totals, download link.
- Download link is signed/short-lived for security.
- Generate-quote action in builder header (replaces Phase 3 stub).
- Internal-summary download is admin-only and surfaced as a separate button.

**Deliverable:** Full v1 feature set. Sales hands PDFs to customers, admins get internal visibility, history is auditable via the saved PDF + frozen totals.

**Dependencies:** Everything prior.

---

## V2 (Post-v1, Not Planned Here)

Captured in the spec under "Out of v1." To be planned in separate cycles:
- MCP server for Cowork / HubSpot.
- Additional SaaS products (Omni, Concierge, Sales).
- Rate-card historical versioning if the frozen-totals-in-quotes approach proves insufficient.
- Staging environment.
- Scenario sharing / collaboration.
- Auto-costing labor SKUs from department rates.
