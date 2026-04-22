# HubSpot Phase 2 — Quote Publish + Approval + Webhooks — Design Spec

> Successor to [Phase 1 catalog sync foundation](../plans/2026-04-21-hubspot-phase-1-catalog-sync-foundation.md). Builds on the full integration design in [2026-04-21-hubspot-integration-design.md](./2026-04-21-hubspot-integration-design.md) — all cross-cutting decisions (pricer-authoritative catalog, native HubSpot Quote as terminal artifact, hybrid line-item representation, terminal-state round-trip only, hard-rail-override approval trigger, classic-or-developer-project static token, single-tenant architecture) carry over unchanged.

## Overview

Phase 2 delivers the end-to-end path from a pricer scenario to a sent HubSpot Quote: state-machine publish, hard-rail-override approval round-trip, and terminal-state webhooks for quote + deal outcomes. Customer-facing quotes stop being our internal PDF — from this phase on, HubSpot is the sending surface (payment links, e-signature). The pricer keeps an immutable `HubSpotQuote` record for reporting and supersedes the old one when a revision publishes.

Phase 2 also closes two catalog gaps Phase 1 surfaced: pricer `Product` and `Bundle` have no `description` or `sku` columns yet, and `Bundle.rolledUpMonthlyPrice` was stubbed at zero. Both are needed for readable quote line items, so we fix them as part of this phase rather than deferring.

Admin UI for Phase 2 is intentionally minimal — a "Publish" action + basic Deal-link form on the scenario page, a published-quotes log, and a webhook-events debugger. The polished pricer-first UX (rich link-to-Deal modal with live search + dedupe) moves to Phase 4. The App Card on Deal records is Phase 3.

## Goals

- A rep (or an admin, or an MCP caller) can publish a pricer scenario to HubSpot as a native Quote. Line items follow the hybrid-by-reason shape: bundles roll up to one line with `pricer_reason = bundle_rollup`; negotiated discounts on individual SKUs use HubSpot's native discount field; ramp pricing carries the step-up schedule in a custom property.
- Scenarios with hard-rail overrides pause at publish time and route to HubSpot's native approval workflow. Pricer waits on the webhook that signals approved/rejected, then resumes or marks the scenario `APPROVAL_REJECTED` accordingly.
- Pricer receives terminal states (Accepted/Declined/Expired for quotes, Won/Lost for deals) via signed webhooks, idempotently, with defence-in-depth against echo loops from our own writes.
- Publishing a revised scenario creates a new HubSpot Quote and stamps `pricer_supersedes` on the prior one — never mutates a sent quote.
- Bundle rolled-up prices are the real number the engine would compute, not a stub.

## Non-Goals

- **Rich pricer-first UX** (Phase 4). Phase 2 ships a basic admin form for linking a scenario to a Deal (dropdown of recent deals + a "create Deal" shortcut). The live-search + duplicate-detection UI lives in Phase 4.
- **App Card on Deal records** (Phase 3). Publishing from inside HubSpot's UI requires the Developer Project UI extension — Phase 3 builds it. Phase 2 is fully driven from the pricer admin or MCP.
- **Approval rejection reason capture** (deferred). Rejection transitions the scenario to `APPROVAL_REJECTED`. No rejection-reason text, no rep notification beyond in-app status. Revisit once real rejections happen and ops has a concrete ask.
- **Soft-rail approval** (deferred). Only hard-rail overrides trigger approval. Soft-rail warnings stay advisory.
- **Payment / webhook-driven payment events** (deferred). We record quote acceptance; actual payment-received events land if/when HubSpot payment integration matures for our portal.
- **Bundle-item membership sync to HubSpot** (out of scope forever per Phase 1 decisions). Bundles are a single rolled-up HubSpot Product; item membership is pricer-internal.

## Decisions Specific to Phase 2

| # | Decision | Chosen |
|---|----------|--------|
| P2-1 | Bundle rolled-up price | Compute via engine (`computeBundlePrice(bundleId)`, pure function extracted from `lib/engine/compute.ts`) |
| P2-2 | Product / Bundle metadata for quotes | Add `description` + `sku @unique` columns; backfill SKUs from slugified names; collision flag for admin resolution |
| P2-3 | Approval rejection UX | Minimal: scenario status + rep sees it next time they open the scenario. No rejection reason capture, no rep notification beyond status. |
| P2-4 | Publish trigger surface (Phase 2 only) | MCP tool + basic admin button + basic Deal-link form on the scenario admin page. Polished rep-facing UX lives in Phase 3 (App Card) and Phase 4 (pricer-first modal). |
| P2-5 | Webhook URL host | `https://ninjapricer-production.up.railway.app/api/hubspot/webhooks/*` |
| P2-6 | Webhook signature algorithm | HubSpot's v3 signature (`X-HubSpot-Signature-V3`), verified against `HUBSPOT_WEBHOOK_SECRET` |
| P2-7 | Echo-loop guard order | Signature → `sourceId == our app` drop → persist to `HubSpotWebhookEvent` (idempotent on `hubspotEventId`) → background processing |
| P2-8 | Approval-approved re-entry | Webhook handler enqueues a resume job (in-process `setImmediate` for now — no separate queue service); resume idempotent on `(scenarioId, revision)` |

## Catalog Enrichment (Phase 2 Pre-Work)

Before the publish flow can produce readable quote lines, the Product and Bundle models need two columns each. Two-step migration:

1. **Add columns nullable.**
   ```prisma
   model Product {
     // ...existing...
     description String?
     sku         String?
   }
   model Bundle {
     // ...existing...
     description String?
     sku         String?
   }
   ```
2. **Backfill.** Migration script populates `sku` from `slugify(name).toUpperCase()` for every existing row. Collisions across products + bundles are written to a one-time `sku_backfill_collisions.log` and left for admin to resolve (a new admin tool: `/admin/catalog/sku-collisions` surfaces them inline with rename actions).
3. **Tighten constraint.** Second migration adds `@unique` to each `sku` column. Runs only after collisions are resolved.

`description` stays nullable — it's optional marketing copy.

`lib/hubspot/catalog/snapshot.ts` (Phase 1) swaps its placeholder empty-strings for the real values. `lib/hubspot/catalog/translator.ts` does the same on the HubSpot side. Pushing catalog to HubSpot after Phase 2 ships starts populating HubSpot's SKU and description fields accurately.

## Bundle Pricing Function

New pure function `computeBundlePrice(bundleId, catalogSnapshot)` in `lib/engine/bundlePricing.ts`:

- Expands a bundle's `BundleItem` rows into a synthetic `ScenarioSnapshot` (SaaS configs from seat/persona mix, labor lines from SKU/qty or dept/hours).
- Calls the existing engine compute path (same as a real scenario).
- Returns `Decimal` — the monthly net revenue assuming baseline term + no additional per-scenario discount.

No side effects, no DB access. Takes the catalog snapshot in (which `lib/hubspot/catalog/snapshot.ts` already loads). Adds no new Prisma queries to the quote publish path.

`snapshot.ts`'s `BundleInput.rolledUpMonthlyPrice` is populated by calling this function per bundle. The TODO placeholder in Phase 1 goes away.

## New Prisma Models

Exactly as designed in the main integration spec, but scoped to Phase 2:

```prisma
model HubSpotQuote {
  id                  String              @id @default(cuid())
  scenarioId          String
  revision            Int
  hubspotQuoteId      String              @unique
  shareableUrl        String?
  publishState        HubSpotPublishState
  supersedesQuoteId   String?             @unique
  publishedAt         DateTime?
  lastStatusAt        DateTime?
  lastStatus          String?             // HubSpot's quote status string
  dealOutcomeAt       DateTime?
  dealOutcome         String?             // WON / LOST / null
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  scenario            Scenario            @relation(fields: [scenarioId], references: [id])
  supersededBy        HubSpotQuote?       @relation("Supersedes", fields: [supersedesQuoteId], references: [id])
  supersedes          HubSpotQuote?       @relation("Supersedes")

  @@unique([scenarioId, revision])
}

enum HubSpotPublishState {
  DRAFT
  PENDING_APPROVAL
  PUBLISHING
  PUBLISHED
  SUPERSEDED
  FAILED
  APPROVAL_REJECTED
}

model HubSpotApprovalRequest {
  id                  String                  @id @default(cuid())
  scenarioId          String                  @unique
  hubspotDealId       String
  railViolations      Json                    // snapshot of hard-rail overrides that triggered approval
  submittedAt         DateTime                @default(now())
  status              HubSpotApprovalStatus   @default(PENDING)
  resolvedAt          DateTime?
  resolvedByUserId    String?
  scenario            Scenario                @relation(fields: [scenarioId], references: [id])
}

enum HubSpotApprovalStatus {
  PENDING
  APPROVED
  REJECTED
}

model HubSpotWebhookEvent {
  id                  String    @id @default(cuid())
  hubspotEventId      String    @unique
  subscriptionType    String
  objectType          String
  objectId            String
  payload             Json
  receivedAt          DateTime  @default(now())
  processedAt         DateTime?
  processingError     String?
  processingAttempts  Int       @default(0)
}
```

Additive fields on existing models:

- `Scenario`: `hubspotDealId String?`, `hubspotCompanyId String?`, `hubspotPrimaryContactId String?`
- `Quote` (existing pricer Quote): `hubspotQuoteId String?`, `publishState HubSpotPublishState @default(DRAFT)`

## Publish Flow

Single function `publishScenarioToHubSpot(scenarioId)` in `lib/hubspot/quote/publish.ts`. State machine on `HubSpotPublishState`:

1. **Precheck.** Load scenario. Error if no `hubspotDealId` (returns a structured error the admin UI surfaces as "Link to HubSpot Deal first"). Error if scenario has no lines.
2. **Threshold check.** Run the engine's rail evaluation. Filter to hard-rail violations *with a rep override recorded*. If any → branch to approval flow below. Else continue.
3. **Compose line items** via new pure function `scenarioToHubSpotLineItems(scenario, catalogSnapshot, bundlePrices)`:
   - Each bundle → one line, `pricer_reason: bundle_rollup`, unit price from `computeBundlePrice`, `pricer_original_list_price` = sum of bundle items' list prices.
   - Each SaaS line with a negotiated discount → `pricer_reason: negotiated`, native `hs_discount_percentage` populated, `price` = list.
   - Ramp/intro pricing → `pricer_reason: ramp`, `price` overridden, `pricer_ramp_schedule` = JSON schedule.
   - Labor lines → `pricer_reason: other`, hourly/package rate.
4. **Create HubSpot Quote.** POST `/crm/v3/objects/quotes` with `name`, `hs_expiration_date`, association to `hubspotDealId`, `pricer_scenario_id`, `pricer_revision`. Transition local `HubSpotQuote.publishState` = `PUBLISHING`.
5. **Create line items.** One POST per line to `/crm/v3/objects/line_items` carrying HubSpot-standard + our custom properties.
6. **Associate line items → quote.** PUT through the associations API.
7. **Publish.** Set required HubSpot fields (signer, terms, links) from scenario config with fallbacks in `HubSpotConfig`; transition the HubSpot quote to publishable state; fetch the shareable URL.
8. **Supersede prior revision.** If a prior `HubSpotQuote` exists for this `scenarioId`, mark it `SUPERSEDED`, stamp `supersedesQuoteId` on the new row, PATCH `pricer_supersedes` on the old HubSpot quote. Do *not* void the old quote.
9. **Record.** Update local rows to `PUBLISHED` with the quote ID, URL, timestamp.
10. **Return** `{hubspotQuoteId, shareableUrl, correlationId}`.

Idempotency key: `(scenarioId, revision)`. Re-entry at any step is safe — each step guards against re-creation if its output already exists.

Partial failure doesn't roll back — the row stays at its last-successful state with an error record, so an admin can retry from the admin UI.

## Approval Flow

Triggered when publish Step 2 detects hard-rail overrides.

1. Pricer writes a `HubSpotApprovalRequest` row with the rail-violation snapshot. Local `HubSpotQuote.publishState` = `PENDING_APPROVAL`.
2. Pricer PATCHes the linked HubSpot Deal: `pricer_approval_status = pending`, `pricer_margin_pct = <computed>`, `pricer_scenario_id`.
3. HubSpot Workflow (configured outside this repo by the HubSpot admin — documented contract in the runbook) watches for `pricer_approval_status = pending`, routes an approval task to the Deal owner's manager, surfaces the rail violation context via `pricer_margin_pct` and related properties in the task template.
4. Manager clicks Approve or Reject in HubSpot. The Workflow writes `pricer_approval_status = approved | rejected`.
5. HubSpot fires `deal.propertyChange` on `pricer_approval_status`. Our `/api/hubspot/webhooks/deal` handler:
   - **approved** → lookup `HubSpotApprovalRequest` by `hubspotDealId`, mark resolved, re-enter `publishScenarioToHubSpot` from Step 3 (bypasses the threshold check on re-entry since approval is recorded).
   - **rejected** → mark request resolved, transition local `Quote.publishState` to `APPROVAL_REJECTED`. The rep sees this next time they open the scenario.
6. Approver identity (matched from HubSpot owner ID → pricer user email) is best-effort. If mapping fails, `resolvedByUserId` stays null — not a blocker.

The HubSpot Workflow itself is not built by this spec. Its contract:
- Triggers on `Deal.pricer_approval_status` transitioning to `pending`
- Writes `approved` or `rejected` back to the same property on manager decision
- May use any `pricer_*` Deal property in its task/notification template
- Must not mutate other `pricer_*` properties

A runbook section documents the workflow setup for whoever admins HubSpot.

## Webhook Ingestion

Two route handlers — both unauthenticated at the route level but signature-verified in the handler:

- `app/api/hubspot/webhooks/quote/route.ts` — `quote.propertyChange` on the `hs_status` field
- `app/api/hubspot/webhooks/deal/route.ts` — `deal.propertyChange` on `dealstage` + `pricer_approval_status`

Handler order (strict):

1. **Signature verification.** `verifyHubSpotSignature(rawBody, headers, secret)`. 401 on mismatch. No logging beyond a sampled warning to avoid log flooding.
2. **Echo filter.** If `sourceId` from the payload matches our deployed private app ID, return 200 and persist nothing. The app ID is recorded in `HubSpotConfig.appId` at setup; env var `HUBSPOT_APP_ID` as a fallback.
3. **Persist.** Write row to `HubSpotWebhookEvent` (unique on `hubspotEventId`; duplicate deliveries are a no-op). Return 200. HubSpot retries aggressively on 4xx/5xx — always-200 prevents retry storms.
4. **Enqueue processing.** `setImmediate(() => processEvent(eventId))`. No external queue service. For Phase 2 this is sufficient — event rate is far below what the Next.js app can absorb inline on Railway.
5. **Processing worker** (`lib/hubspot/webhooks/process.ts`):
   - Skip if already processed.
   - Route to handler by `subscriptionType`:
     - `quote.propertyChange`: if the status field transitioned to `ACCEPTED` / `REJECTED` / `EXPIRED`, update the `HubSpotQuote.lastStatus` + `lastStatusAt`.
     - `deal.propertyChange`:
       - If `dealstage` changed to a Won/Lost value (pricer looks up HubSpot's pipeline → stage type), stamp `HubSpotQuote.dealOutcome` + `dealOutcomeAt` on the latest published quote for that Deal.
       - If `pricer_approval_status` changed, run the approval resolution (see Approval Flow Step 5).
   - Stamp `processedAt`. Increment `processingAttempts` on retry. Record `processingError` and leave `processedAt` null on failure.

Admin UI webhook-events log exposes failed rows with a "Retry" action.

## Revision / Supersede

A rep revises a scenario after publish → the pricer treats this as a revision. Incrementing `revision` on the scenario (stored on `HubSpotQuote` as part of the idempotency key) creates a new HubSpot Quote row on next publish. Supersede happens in publish Step 8: old row marked `SUPERSEDED`, `supersedesQuoteId` linked, old HubSpot quote's `pricer_supersedes` property stamped with the new quote ID.

Old HubSpot quote stays visible to the customer at its shareable URL (decision #9 in the main spec — no auto-void). Phase 2 does not add an auto-void toggle.

## MCP Tools Added

Extend the existing `lib/mcp/tools/hubspot.ts` (Phase 1 registered `hubspotCatalogTools`). Phase 2 adds `hubspotQuoteTools` array:

| Tool | Scope | Purpose |
|------|-------|---------|
| `link_scenario_to_hubspot_deal` | sales + admin | Link scenario to existing Deal (validates dealId exists) |
| `create_hubspot_deal_for_scenario` | sales + admin | Create new Deal + associate Contact/Company. Phase 2 version performs basic duplicate detection by email/domain and returns matches; caller decides create-anyway. Phase 4 will wrap this in a richer UI. |
| `publish_scenario_to_hubspot` | sales + admin | Publish a scenario; may return `pending_approval` |
| `check_publish_status` | sales + admin | Current publish state, HubSpot quote URL, approval status |
| `supersede_hubspot_quote` | sales + admin | Convenience wrapper: snapshot scenario into a new revision + publish |

All are admin-UI-callable via server actions (same pattern as Phase 1).

## Admin UI Additions (Minimal)

All under `app/admin/hubspot/`:

- **`/admin/hubspot/published-quotes/page.tsx`** — table of HubSpot quotes with columns: scenario name, revision, status, HubSpot URL, last status change, deal outcome, supersede chain. Row actions: refresh status, open in HubSpot. No filters beyond date range.
- **`/admin/hubspot/webhook-events/page.tsx`** — last 200 webhook events. Columns: received-at, subscription type, object type, processed-at, error. Row action: retry.
- **Scenario admin page enhancements** (`app/scenarios/[id]/page.tsx` or equivalent): new section "HubSpot" with:
  - If not linked to a Deal → dropdown + "Link Deal" button + "Create new Deal" button opening a simple form (email + company domain required)
  - If linked but not published → "Publish to HubSpot" button + rail-warning summary
  - If pending approval → "Waiting on manager approval" banner
  - If published → quote link, revision number, status, "Revise" button
  - If approval rejected → banner with "Revise and resubmit" action

The scenario page enhancements are intentionally basic — no live search, no dedupe modal. Phase 4 polishes this.

Catalog admin also gains:
- **`/admin/catalog/sku-collisions/page.tsx`** — one-time tool, empty when backfill has no unresolved collisions.

## HubSpot Project Updates

The Developer Project at `hubspot-project/` needs webhook subscriptions added to `src/app/app-hsmeta.json`. Webhook features require the `webhooks` feature block in the manifest (the `hs project add` flow supports this, or we hand-edit). Redeploy + reinstall in the portal (same Reinstall URL flow Phase 1 used).

New scopes likely needed:
- `crm.objects.owners.read` — for matching approver identity
- Additional webhook subscription scopes depending on event type (the `hs project upload` validator will tell us if any are missing)

`HUBSPOT_WEBHOOK_SECRET` gets added to Railway env.

## Error Handling and Idempotency

Pattern matches Phase 1:

- HubSpot 5xx / 429 → retry with backoff (already in `hubspotFetch`).
- HubSpot 4xx (non-429) → surface to caller; partial state on pricer side stays at last-successful step.
- Inbound webhooks → always 200 after persist (prevents HubSpot retry storms).
- Idempotency keys: `(scenarioId, revision)` for publish; `hubspotEventId` for webhooks; single-row `HubSpotApprovalRequest` per scenario (`@unique scenarioId`).

## Testing

- **Unit:** `scenarioToHubSpotLineItems` (every `pricer_reason` path), `computeBundlePrice`, webhook signature verify, publish state machine transitions.
- **Integration (DB-backed):** publish happy path, publish with approval + simulated approve webhook, publish with approval + simulated reject, supersede, webhook idempotency on replay.
- **Integration (live HubSpot, gated on env):** extend `tests/integration/hubspot/` with a round-trip that creates a test Deal, publishes a scenario, validates the quote appears in HubSpot with the expected line items + properties, simulates a status webhook by direct API call.
- **Manual QA:** runbook `docs/superpowers/runbooks/hubspot-phase-2.md` walks through the HubSpot Workflow setup + end-to-end publish/approve/reject/supersede.

## Deployment

1. Prisma migration applied.
2. `hubspot-project/` updated + redeployed + reinstalled; new scopes approved.
3. `HUBSPOT_WEBHOOK_SECRET` set in Railway.
4. HubSpot admin configures the approval Workflow per runbook contract.
5. SKU backfill script runs; any collisions surfaced on `/admin/catalog/sku-collisions`.
6. Smoke test: publish a real scenario against a real Deal; verify HubSpot Quote + webhook round-trip.

## Open Questions and Phase 3+ Followups

- **App Card on Deal** → Phase 3. Rep clicks "Build Quote" from the Deal record → opens pricer deep-linked to a scenario bound to that Deal.
- **Pricer-first rich UX** → Phase 4. Live Deal search, richer dedupe UI, "Create Deal" wizard.
- **Approval rejection reason + notification** → Phase 5 (or a follow-up once real rejections drive a concrete ask).
- **Auto-void superseded HubSpot quotes** → future toggle if customers get confused by stale URLs.
- **Scenario-level aggregate rails** (total-deal margin / total-discount gates on top of per-product) — separate spec.
- **Payment-received events** → if HubSpot payment integration becomes load-bearing for the business, wire payment webhooks.
- **Bundle-item membership in HubSpot** — explicitly out of scope forever; HubSpot treats bundles as opaque products.
