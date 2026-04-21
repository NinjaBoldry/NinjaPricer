# Ninja Pricer — HubSpot Integration — Design Spec

> Scoped as a successor to the v2 MCP server work. HubSpot integration was explicitly deferred in the [v1 design](./2026-04-17-ninja-pricer-v1-design.md) and [v2 MCP design](./2026-04-21-v2-mcp-server-design.md); this is that later design.

## Overview

Keep Ninja Concepts' product catalog synchronized between Ninja Pricer and HubSpot, and make HubSpot the terminal surface for customer-facing quotes. Reps build pricing scenarios in the pricer as they do today; when they publish, the pricer creates a native HubSpot Quote (payment links, e-signature, send — all HubSpot-managed). Our PDF generator becomes an internal preview.

The integration is packaged as a single HubSpot Developer Project (platform version `2026.03`) containing a project-built private app, a React App Card on the Deal record, and serverless App Functions that proxy calls between the card and the pricer API. The pricer holds all pricing math, all audit state, and all catalog authority; HubSpot owns the customer-facing artifact, the approval UX, and payment.

No business logic is duplicated. Every sync, publish, and approval path runs through existing `lib/services/*` functions wrapped as MCP tools and internal endpoints, so the admin UI, MCP callers, and the App Card all share the same code path.

## Goals

- Products and bundles stay in sync between Ninja Pricer and HubSpot. Pricer is authoritative on conflict; HubSpot edits that collide with pricer state land in an admin review queue rather than silently losing.
- A rep can start a quote either from a HubSpot Deal (via the App Card on the Deal's right sidebar) or from the pricer directly; both paths converge on a native HubSpot Quote attached to the Deal.
- Pricing math the pricer does today (tiers, rails, bundle rollups, commissions, margin) stays in the pricer; it never leaks into HubSpot's model beyond what a quote line needs to show a customer.
- When a scenario breaches a hard rail and a rep overrides it, HubSpot runs the approval workflow — managers approve in HubSpot's native task surface, and the pricer releases the publish on approval.
- Catalog sync is **fully manual** in both directions. An admin-only "Sync" button in the pricer (and matching MCP tool) pushes to HubSpot; a companion "Pull" button fetches HubSpot-side edits into the review queue. No background cron jobs, no webhook-driven catalog changes.
- Customer-facing quotes ship from HubSpot with HubSpot-managed payment links; pricer records published-quote state + terminal outcomes (Accepted / Declined / Won / Lost) for its own reporting.

## Non-Goals

- **Bi-directional automation on catalog.** No scheduled pull, no webhook-driven catalog writes. Everything goes through the sync buttons.
- **Tiered / usage-based pricing on the HubSpot side.** Ninja Notes is flat-priced; Omni and similar future products will have usage tiers and are handled in a follow-up spec once that product lands.
- **Two-way sync of non-catalog data.** Scenarios, commissions, cost basis, rate cards, personas, and rails stay pricer-only and are never written to HubSpot.
- **Scenario-level aggregate rails.** Approval triggers off the existing per-product rail evaluation only. Aggregate margin/discount gates are a separate future spec if needed.
- **Bulk Deal/Contact/Company writes.** The pricer may create a single Deal at publish time (with duplicate detection); it does not backfill or mass-import CRM records.
- **Multi-tenant / marketplace distribution.** This is single-tenant for Ninja Concepts. If the pricer is ever white-labeled, migrating to an OAuth public app is a later refactor.
- **Our PDF as a customer artifact.** PDFs remain an internal preview only; customers receive HubSpot quote links.

## Decisions Summary

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Catalog source of truth | Two-way sync, pricer authoritative; HubSpot conflicts flag to review queue |
| 2 | What syncs | Products and bundles only; tiers/rails/rate cards/cost basis stay pricer-only |
| 3 | Quote terminal artifact | Native HubSpot Quote (HubSpot sends, signs, collects payment) |
| 4 | Line item shape | Hybrid by reason: bundle→override, negotiated→list+discount, ramp→override+property |
| 5 | Tier representation in quotes | Deferred to Omni/future product |
| 6 | Approval trigger | Per-product hard-rail overrides (existing `Rail` model). Soft rails stay advisory. |
| 7 | Approval UX | HubSpot workflow owns routing, notification, decision capture |
| 8 | Post-publish round-trip | Webhooks for terminal states only (Accepted / Declined / Won / Lost) |
| 9 | Revisions | Create new HubSpot Quote, mark prior as superseded via `pricer_supersedes` property; do not auto-void |
| 10 | Sync cadence | Fully manual both directions; admin button + MCP tool |
| 11 | Initial seeding | One-time push from pricer to HubSpot via same manual tool, triggered when admin decides catalog is ready |
| 12 | App/auth model | HubSpot Developer Project (platform 2026.03) containing a project-built private app + App Card + App Functions |
| 13 | Entry points | App Card on Deal record (phase 1); pricer-first with Deal linkage required at publish (phase 1); stage-triggered workflow task (phase 2) |
| 14 | Pricer-first Deal linkage | Deal optional during scratch work; required at publish time; duplicate detection on email / company domain at that moment |
| 15 | Architecture shape | Embedded in existing Next.js app (Approach 1); no sidecar service |

## Architecture

**Repo layout.** Existing pricer structure unchanged; add `/hubspot-project/` as an npm workspace.

```
app/
  api/
    hubspot/
      webhooks/
        quote/route.ts            — quote terminal-state handler
        deal/route.ts             — deal terminal-state + approval-status handler
      card/
        state/route.ts            — GET: card state for a dealId (called by App Function)
        publish/route.ts          — POST: publish scenario (called by App Function)
        link/route.ts             — POST: link or create Deal for scenario
  admin/
    hubspot/
      page.tsx                    — integration status + thresholds config
      sync/page.tsx               — catalog sync with push/pull buttons + diff preview
      review-queue/page.tsx       — pending HubSpot edits awaiting admin resolution
      published-quotes/page.tsx   — log of published HubSpot quotes per scenario
      webhook-events/page.tsx     — tail of HubSpotWebhookEvent for debugging
lib/
  hubspot/
    client.ts                     — hubspotFetch wrapper (retries, rate-limit, correlation)
    auth.ts                       — shared-secret verification for App Function calls
    catalog/
      hash.ts                     — deterministic hash of synced fields
      push.ts                     — publish_catalog_to_hubspot logic
      pull.ts                     — pull_hubspot_changes logic
      reviewQueue.ts              — enqueue / resolve review items
    quote/
      translator.ts               — scenario → HubSpot line items (pure fn)
      publish.ts                  — state-machine publish flow
      supersede.ts                — revision handling
    approval/
      threshold.ts                — decides if scenario needs approval (hard-rail overrides)
      workflow.ts                 — posts pricer_approval_status changes to HubSpot
    webhooks/
      process.ts                  — idempotent event processor (reads HubSpotWebhookEvent)
      verify.ts                   — signature verification on inbound
    setup/
      provisionProperties.ts      — idempotent: creates custom props on Product/Deal/Quote/LineItem
lib/mcp/tools/hubspot.ts          — MCP tool handlers (thin wrappers over lib/hubspot/*)
lib/db/repositories/              — new repos: hubspotProductMap, hubspotQuote, hubspotReviewQueueItem, hubspotWebhookEvent, hubspotApprovalRequest
prisma/schema.prisma              — new HubSpot* models + additive fields on existing models
scripts/hubspot-setup.ts          — one-time run: provisions custom properties
hubspot-project/
  hsproject.json                  — platformVersion: 2026.03
  src/
    app/
      app-hsmeta.json             — private-app config (scopes, webhook subscriptions)
      cards/
        ninja-pricer-card.tsx     — React App Card
        ninja-pricer-card-hsmeta.json
      functions/
        get-card-state.ts         — proxies to /api/hubspot/card/state
        publish-quote.ts          — proxies to /api/hubspot/card/publish
        link-deal.ts              — proxies to /api/hubspot/card/link
```

**Runtime topology.**

1. Pricer's Next.js app (existing Railway deployment) handles all pricing math, sync logic, and webhook ingestion.
2. HubSpot Developer Project is deployed separately via `hs project upload` to Ninja's HubSpot portal. This gives us:
   - The private app (access token, scopes, webhook subscriptions pointing at the pricer's `/api/hubspot/webhooks/*` URLs)
   - The App Card rendered in HubSpot's UI
   - The App Functions that sit between the card and the pricer API, called from HubSpot's infra so the card's fetches are same-origin from HubSpot's perspective
3. A shared secret is known only to the App Functions and the pricer's `/api/hubspot/card/*` endpoints; these endpoints accept no other caller.

**Load-bearing rule.** `lib/hubspot/*` is pure orchestration over the existing `lib/services/*`. It does not own business logic — translating a scenario to line items is a pure function of scenario + catalog snapshot; the publish state machine calls the translator and the HubSpot client but never reaches into Prisma directly.

## Data Model Additions

### New models

```prisma
model HubSpotConfig {
  id                      String   @id @default(cuid())
  portalId                String
  enabled                 Boolean  @default(false)
  accessTokenSecretRef    String              // references env/secret store, not the token itself
  lastPushAt              DateTime?
  lastPullAt              DateTime?
  approvalMarginBasis     MarginBasis @default(CONTRIBUTION)
  // additional aggregate thresholds may be added later; per-product rails are the primary trigger
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@unique([portalId])
}

model HubSpotProductMap {
  id                String   @id @default(cuid())
  pricerProductId   String?  @unique
  pricerBundleId    String?  @unique
  hubspotProductId  String   @unique
  kind              HubSpotProductKind
  lastSyncedHash    String
  lastSyncedAt      DateTime
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  product           Product? @relation(fields: [pricerProductId], references: [id])
  bundle            Bundle?  @relation(fields: [pricerBundleId], references: [id])
}

enum HubSpotProductKind {
  PRODUCT
  BUNDLE
}

model HubSpotQuote {
  id                  String   @id @default(cuid())
  scenarioId          String
  revision            Int
  hubspotQuoteId      String   @unique
  shareableUrl        String?
  publishState        HubSpotPublishState
  supersedesQuoteId   String?  @unique
  publishedAt         DateTime?
  lastStatusAt        DateTime?
  lastStatus          String?             // HubSpot's quote status string
  dealOutcomeAt       DateTime?
  dealOutcome         String?             // WON / LOST / null
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  scenario            Scenario @relation(fields: [scenarioId], references: [id])
  supersededBy        HubSpotQuote? @relation("Supersedes", fields: [supersedesQuoteId], references: [id])
  supersedes          HubSpotQuote? @relation("Supersedes")

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

model HubSpotReviewQueueItem {
  id                  String   @id @default(cuid())
  entityType          HubSpotProductKind
  hubspotId           String
  pricerEntityId      String
  changedFields       Json                 // {fieldName: {pricer, hubspot}}
  changedFieldsHash   String
  detectedAt          DateTime @default(now())
  resolvedAt          DateTime?
  resolution          HubSpotReviewResolution?
  resolvedByUserId    String?

  @@unique([entityType, hubspotId, changedFieldsHash])
}

enum HubSpotReviewResolution {
  ACCEPT_HUBSPOT
  REJECT
  IGNORE
}

model HubSpotWebhookEvent {
  id                  String   @id @default(cuid())
  hubspotEventId      String   @unique
  subscriptionType    String
  objectType          String
  objectId            String
  payload             Json
  receivedAt          DateTime @default(now())
  processedAt         DateTime?
  processingError     String?
  processingAttempts  Int      @default(0)
}

model HubSpotApprovalRequest {
  id                  String   @id @default(cuid())
  scenarioId          String
  hubspotDealId       String
  railViolations      Json                 // snapshot of hard-rail overrides that triggered approval
  submittedAt         DateTime @default(now())
  status              HubSpotApprovalStatus @default(PENDING)
  resolvedAt          DateTime?
  resolvedByUserId    String?              // pricer user id if known (admin=manager)

  scenario            Scenario @relation(fields: [scenarioId], references: [id])

  @@unique([scenarioId])
}

enum HubSpotApprovalStatus {
  PENDING
  APPROVED
  REJECTED
}
```

### Additive fields on existing models

- `Scenario` — `hubspotDealId String?`, `hubspotCompanyId String?`, `hubspotPrimaryContactId String?`. Existing `customerName` remains for unlinked scratch work.
- `Product` — `hubspotProductId String?` (denormalized accessor; primary mapping lives in `HubSpotProductMap`).
- `Bundle` — `hubspotProductId String?` (bundles are HubSpot Products).
- `Quote` (existing pricer quote) — `hubspotQuoteId String?`, `publishState HubSpotPublishState @default(DRAFT)`. No existing flow breaks; fields are nullable/defaulted.

All HubSpot-related additions are additive and nullable, so every existing pricer-only flow continues untouched for customers who never publish to HubSpot.

## HubSpot Developer Project

The project is the unit of deployment for everything HubSpot-facing.

**`hsproject.json`** declares `platformVersion: "2026.03"` and the app directory.

**`src/app/app-hsmeta.json`** — the project-built private app config — declares:

- Scopes (the runtime access list):
  - `crm.objects.products.read`, `crm.objects.products.write`
  - `crm.schemas.products.read`
  - `crm.objects.quotes.read`, `crm.objects.quotes.write`
  - `crm.objects.line_items.read`, `crm.objects.line_items.write`
  - `crm.objects.deals.read`, `crm.objects.deals.write`
  - `crm.objects.contacts.read`, `crm.objects.contacts.write`
  - `crm.objects.companies.read`, `crm.objects.companies.write`
  - `crm.objects.owners.read`
- Webhook subscriptions:
  - `quote.propertyChange` — filtered to the status field (terminal states only; handler filters further)
  - `deal.propertyChange` — filtered to `dealstage` and the custom `pricer_approval_status` property
  - Target URLs: `/api/hubspot/webhooks/quote` and `/api/hubspot/webhooks/deal` on the pricer

**`src/app/cards/ninja-pricer-card.tsx`** — React component built with `@hubspot/ui-extensions`. Location `crm.record.tab`, `objectTypes: ["DEAL"]`. Three render states driven by data from `get-card-state`:

1. **No scenario yet.** Shows Deal context (customer, pipeline, amount) + "Build Quote" button.
2. **Scenario linked, not yet published.** Shows scenario title, last-edited timestamp, rail warning list (from the engine's existing evaluation), rep-level buttons "Continue in Pricer" and "Publish to HubSpot" (the latter disabled if approval is pending or scenario is incomplete, with the reason on hover). Approval-pending banner when relevant.
3. **Published.** Shows HubSpot Quote link, current quote status (read from HubSpot directly; no pricer round-trip needed since the card is rendering inside HubSpot), revision number, and a "Revise" button that creates a supersede scenario.

**`src/app/functions/*.ts`** — serverless App Functions. Each function is a thin authenticated proxy to a pricer endpoint. The function attaches the shared secret as a header; the pricer endpoint rejects anything without it.

## Custom Properties Provisioned at Setup

Created once by `scripts/hubspot-setup.ts`. The script is idempotent — re-running only creates missing properties.

**Product (HubSpot object type `PRODUCT`):**
- `pricer_managed` (bool) — true for Ninja-owned products; false or absent means HubSpot-only, out of scope for sync
- `pricer_product_id` (string) — backreference to pricer `Product.id` or `Bundle.id`
- `pricer_kind` (enum: `product | bundle`)
- `pricer_last_synced_hash` (string)

**Line Item:**
- `pricer_reason` (enum: `bundle_rollup | negotiated | ramp | other`)
- `pricer_original_list_price` (number; populated on override so the spread is recoverable)
- `pricer_scenario_id` (string)
- `pricer_ramp_schedule` (string, JSON; populated for ramp lines)

**Deal:**
- `pricer_scenario_id` (string)
- `pricer_approval_status` (enum: `not_required | pending | approved | rejected`)
- `pricer_margin_pct` (number)

**Quote:**
- `pricer_scenario_id` (string)
- `pricer_revision` (int)
- `pricer_supersedes` (string → prior HubSpot quote ID)

## Catalog Sync

### Push: `publish_catalog_to_hubspot`

1. Load pricer Products and Bundles that are `isActive`.
2. Compute the sync-field hash per record (see hashing rules below).
3. Diff against `HubSpotProductMap.lastSyncedHash`:
   - Unmapped → create new HubSpot Product; record mapping.
   - Mapped, hash unchanged → no-op.
   - Mapped, hash changed → update HubSpot Product.
4. Apply creates/updates via `/crm/v3/objects/products`. On success, update `lastSyncedHash` + `lastSyncedAt` in the mapping.
5. Deletions are **never automatic**. If a pricer product is deactivated, the admin sees a separate "Archive in HubSpot" action next to it in the sync UI.
6. Return a summary `{created, updated, unchanged, failed[], correlationId}` for the UI and MCP caller.

### Pull: `pull_hubspot_changes`

1. Query `/crm/v3/objects/products` filtered to `pricer_managed = true` with all synced properties.
2. For each HubSpot product with an existing mapping, compute the hash from HubSpot's side.
3. If `hubspotHash != mapping.lastSyncedHash` and `pricerHash != mapping.lastSyncedHash`:
   - **Pricer changed since last sync** — this is "push needed," not a review item. Surface in the sync UI as pending outbound.
4. If `hubspotHash != mapping.lastSyncedHash` and `pricerHash == mapping.lastSyncedHash`:
   - **HubSpot edited a field we own** — enqueue `HubSpotReviewQueueItem` with the field-level diff.
5. Unmapped `pricer_managed = true` products (rare; shouldn't happen under normal operation) are flagged as orphans for admin attention.
6. Non-`pricer_managed` HubSpot products are ignored entirely.

### Hashing rules

Synced fields only, hashed with stable serialization (sorted keys, canonical number formatting) so the hash is identical on both sides for equivalent data.

- **Products.** `name`, `description`, `sku`, `unitPrice`, `recurringBillingFrequency`, plus any pricer marketing-facing custom properties (e.g., `displayDescription`).
- **Bundles** (represented as a single HubSpot Product). `name`, `description`, `sku` (bundle SKU), rolled-up headline price (`unitPrice`), and a deterministic serialization of the bundle's *included-item identifiers and rollup parameters* (not the full item list — just enough that changing which items are in the bundle, or their rollup weights, changes the hash). This lets us detect when a HubSpot edit to bundle name/description/price collides with pricer state, while treating the bundle as one synced record on HubSpot's side.

Cost basis, tier definitions, rails, commissions, and bundle-item individual costs are **not** in the hash — they never reach HubSpot and therefore can never be part of a conflict.

### Review queue UI

Per row: entity type, hubspot ID, changed field list with (pricer value | HubSpot value) side by side, and three actions:

- **Accept HubSpot change** — apply HubSpot's value to the pricer, update `lastSyncedHash`.
- **Reject & overwrite on next sync** — mark resolved; next push will overwrite HubSpot. Does not push immediately.
- **Ignore** — mark resolved without changing either side. Useful for one-off HubSpot tweaks we don't want to learn from.

## Quote Publish Flow

`publishScenarioToHubSpot(scenarioId)`:

1. **Precheck.**
   - Scenario must have `hubspotDealId`. If missing, publish returns a structured error telling the UI to show the "Link to HubSpot Deal" modal.
   - Scenario must have at least one non-empty line.
2. **Threshold check.**
   - Run the engine's rail evaluation. Find hard-rail violations with a rep override recorded on the scenario.
   - If any → skip to approval flow (below). Do not create the HubSpot Quote yet.
   - If none → proceed.
3. **Compose line items via `translator.ts`.**
   - Each bundle → one line, `pricer_reason: bundle_rollup`, unit price overridden with the bundle's computed total, `pricer_original_list_price` stamped with the sum of bundle items' list prices.
   - Each SaaS line with a negotiated discount → `pricer_reason: negotiated`, HubSpot's native discount field populated, list price left intact.
   - Ramp/intro pricing → `pricer_reason: ramp`, unit price overridden, `pricer_ramp_schedule` stamped with the full step-up schedule as JSON.
   - Labor lines → `pricer_reason: other`, unit price at the quoted hourly or package rate.
4. **Create HubSpot Quote.** POST `/crm/v3/objects/quotes` with `name`, `expiration`, association to `hubspotDealId`, `pricer_scenario_id`, `pricer_revision`. Set `publishState = PUBLISHING` on the pricer Quote.
5. **Create line items.** One POST per line to `/crm/v3/objects/line_items` carrying standard fields + our custom properties.
6. **Associate.** PUT each line item → quote via the associations API.
7. **Publish.** Set required HubSpot quote fields (signer, terms, links) from scenario config with fallbacks in `HubSpotConfig`; transition the HubSpot quote to publishable state; fetch the shareable URL.
8. **Supersede prior revision.** If a `HubSpotQuote` exists for this `scenarioId` from an earlier revision, mark it `SUPERSEDED`, stamp `supersedesQuoteId` on the new row, and set `pricer_supersedes` on the old HubSpot quote. Do not void the old HubSpot quote.
9. **Record.** Update the pricer Quote and `HubSpotQuote` rows to `PUBLISHED` with the quote ID, URL, and timestamp.
10. **Return** `{hubspotQuoteId, shareableUrl, correlationId}`.

**State machine.** `HubSpotPublishState` enum tracks progress; partial failure leaves the row in its last successful state. Retry picks up from the current state. `(scenarioId, revision)` is the idempotency key; every multi-step call guards against re-entry using this.

## Approval Flow

Triggered when Step 2 of publish detects hard-rail overrides.

1. Pricer writes a `HubSpotApprovalRequest` row with the rail-violation snapshot.
2. Pricer sets the scenario's pricer Quote `publishState = PENDING_APPROVAL`.
3. Pricer patches the linked HubSpot Deal: `pricer_approval_status = pending`, `pricer_margin_pct = <computed>`, `pricer_scenario_id = <id>`.
4. A HubSpot Workflow — configured by Ninja's HubSpot admin outside this repo — watches `pricer_approval_status` transitioning to `pending`, routes an approval task to the Deal owner's manager (or a designated approvers group; exact routing is HubSpot-side config), and surfaces the rail-violation context via the workflow's message template pulling `pricer_margin_pct` and related properties.
5. Manager approves or rejects within HubSpot. Workflow sets `pricer_approval_status = approved | rejected`.
6. HubSpot fires `deal.propertyChange` on `pricer_approval_status`. Our webhook handler (`/api/hubspot/webhooks/deal`) looks up the `HubSpotApprovalRequest` by `hubspotDealId`:
   - Approved → resume publish flow from Step 3 onward. Record the approver's identity (matched from HubSpot owner ID → pricer user via email, best-effort).
   - Rejected → pricer Quote transitions to `APPROVAL_REJECTED`. Rep sees the outcome in the pricer UI and the App Card; can revise the scenario to remove the override and re-publish.
7. The App Card on the Deal shows live approval state by reading `pricer_approval_status` directly from the Deal.

**Unification with the existing admin override path.** The pricer already permits admin overrides of hard rails. When a rep publishes with an override, the HubSpot approval workflow *is* the admin override gate — no separate in-pricer override release is needed. Admins who approve in HubSpot are the same people who have override authority in the pricer admin, so identity and trust model line up.

**What the spec does not build.** The HubSpot Workflow itself (routing rules, notification template, approver group) is configured by whoever owns HubSpot admin. This spec documents the required contract:

- Workflow must trigger on `Deal.pricer_approval_status` transitioning to `pending`.
- Workflow must set the same property to `approved` or `rejected` based on manager decision.
- Workflow may use any of the `pricer_*` Deal properties for its task/notification template.
- No other side effects should mutate these `pricer_*` properties.

## Round-Trip Webhooks

Only terminal states flow back to the pricer.

- **`/api/hubspot/webhooks/quote`** — subscribed to `quote.propertyChange`. Filter: status transitions to `ACCEPTED`, `REJECTED`, `EXPIRED`. Updates `HubSpotQuote.lastStatus` + `lastStatusAt`.
- **`/api/hubspot/webhooks/deal`** — subscribed to `deal.propertyChange`:
  - `dealstage` transitions to Won/Lost — updates `HubSpotQuote.dealOutcome` + `dealOutcomeAt` on the latest published quote for that deal.
  - `pricer_approval_status` transitions — drives the approval flow.

**Processing pattern.**

1. Every inbound request is signature-verified (`verify.ts`) against `HUBSPOT_WEBHOOK_SECRET`.
2. **Echo filter.** HubSpot payloads include a `sourceId` identifying who made the change. If it equals our private app's ID, the handler drops the event here and returns 200. Nothing is persisted.
3. Surviving events are written to `HubSpotWebhookEvent` (unique on `hubspotEventId`; duplicate deliveries are no-ops) and the handler returns 200. HubSpot retries aggressively on 4xx/5xx; always-200 prevents a retry storm.
4. A background worker reads unprocessed `HubSpotWebhookEvent` rows and processes them via `webhooks/process.ts`. Processing is idempotent — re-running on an already-processed event is a no-op.
5. On processing failure, the error is recorded and the row is left for manual retry from the admin webhook-events log.

**Defense-in-depth against echo loops.** The `sourceId` filter is the primary guard. Hash-based change detection in catalog pulls compares against our most recent push hash, so echoes are a no-op at the catalog layer even if a webhook slipped past the filter.

## App Card UX (phase 1)

Lives at `src/app/cards/ninja-pricer-card.tsx`. Renders in the Deal record's right sidebar (`crm.record.tab`).

**Data access.** The card does not call pricer URLs directly. It calls the `get-card-state` App Function with the current `dealId`; that function adds the shared secret header and calls `/api/hubspot/card/state?dealId=<id>`. Two other App Functions (`publish-quote`, `link-deal`) mirror the other pricer endpoints the card needs.

**States.**

1. **No scenario.** Deal context + **Build Quote** → opens pricer in new tab with `?dealId=<id>&contactId=<id>&companyId=<id>`. Pricer creates a Draft scenario linked to the Deal and preloads customer info.
2. **Scenario linked, not published.** Title, last-edited timestamp, list of engine-emitted rail warnings (with severity), **Continue in Pricer** and **Publish to HubSpot** buttons. Approval-pending banner + manager name when applicable.
3. **Published.** HubSpot quote link, current quote status (read from HubSpot's own Deal associations, not pricer), revision number, **Revise** button creating a supersede.

## Pricer-first flow

1. Rep builds a scenario in the pricer admin without linking to HubSpot — scratch math is fine unlinked.
2. Before "Publish to HubSpot" is enabled, the rep must hit "Link to HubSpot Deal":
   - Modal with a live Deal search (queries HubSpot via `/crm/v3/objects/deals/search`).
   - Inline duplicate detection: if rep types a customer name, we search HubSpot Contacts + Companies and show the top three matches.
   - "Create new Deal" requires contact email and/or company domain; HubSpot dedupe runs on these; rep must either pick an existing match or explicitly confirm "no, create anyway."
3. On link, `hubspotDealId` (+ primary contact, company) is set on the scenario.
4. Publish proceeds via the same `publishScenarioToHubSpot` path.

## MCP Tools Added

Slot into the existing v2 MCP server as new tools in `lib/mcp/tools/hubspot.ts`. All are thin wrappers over `lib/hubspot/*` service functions; RBAC matches v2 conventions.

| Tool | Scope | Purpose |
|------|-------|---------|
| `publish_catalog_to_hubspot` | admin | One-shot push of pricer catalog to HubSpot |
| `pull_hubspot_changes` | admin | Pull HubSpot-side edits into review queue |
| `resolve_review_queue_item` | admin | Accept / reject / ignore a review item |
| `archive_hubspot_product` | admin | Explicit archive in HubSpot for deactivated pricer products |
| `link_scenario_to_hubspot_deal` | sales + admin | Link an existing Deal |
| `create_hubspot_deal_for_scenario` | sales + admin | Create new Deal with dedupe |
| `publish_scenario_to_hubspot` | sales + admin | Publish a scenario; may return `pending_approval` |
| `check_publish_status` | sales + admin | Current state + quote URL + approval status |
| `supersede_hubspot_quote` | sales + admin | Convenience wrapper: create revision + publish |
| `hubspot_integration_status` | admin | Config flags, last sync, queue counts |

The admin UI's sync/publish/review buttons POST through the same handler chain, not duplicated code paths.

## Error Handling and Idempotency

**HubSpot transient failures (5xx, 429).** `hubspotFetch` retries with exponential backoff, max 3 attempts, respecting `Retry-After` for rate-limit responses. Every attempt logs `{correlationId, endpoint, attempt, status, durationMs}`.

**HubSpot permanent failures (4xx non-429).** Surfaced to the caller with the HubSpot error body. Multi-step flows (publish, catalog push) leave the partial state on the pricer side — failed rows stay `PUBLISHING` / unsynced with an error record, not rolled back — so diagnosis and manual retry are possible.

**Webhook handler failures.** Handler always returns 200 after writing the event to `HubSpotWebhookEvent`. Processing is decoupled. Failed processing sets `processingError` and leaves `processedAt` null; admin UI offers a retry action.

**Idempotency keys.**
- Publish: `(scenarioId, revision)` — pricer checks for an existing `HubSpotQuote` at that key before starting.
- Catalog push: per-row, driven by `(entity, id, lastSyncedHash)`. If HubSpot rejects a duplicate create, we pull the existing record by SKU and reconcile.
- Webhooks: `hubspotEventId` unique constraint on `HubSpotWebhookEvent`; duplicate events are no-ops.
- Review queue: unique on `(entityType, hubspotId, changedFieldsHash)`; the same unresolved field delta detected twice doesn't double-enqueue.

**Observability.** Every HubSpot-touching code path emits `{correlationId, operation, hubspotEndpoint, durationMs, status, scenarioId?, productId?}`. Admin dashboard surfaces the last N events and aggregate counts for the last 24h.

## Testing

**Unit (Vitest, pure).**
- `translator.ts` — scenario + catalog → line-item list, every `pricer_reason` path.
- `hash.ts` — equivalence of hashes for equivalent inputs; stable key order; number canonicalization.
- `catalog/pull.ts` diff logic.
- `approval/threshold.ts` — correctly detects hard-rail overrides vs soft warnings.
- State-machine guards in `quote/publish.ts`.

**Integration (HubSpot Developer Test Account).**
- Catalog push/pull round-trip; review-queue population; resolution actions.
- Publish happy path: scenario → HubSpot Quote → associations → publishable state → URL.
- Publish with approval: scenario with hard-rail override → `pending_approval` → simulated workflow flip → resume → published.
- Supersede: publish v1 → revise → publish v2 → v1 marked superseded in pricer and in HubSpot property.
- Webhook ingest: simulate terminal-state events; verify dedupe on replay.

**Contract tests.** Pin expected response shapes for `POST /crm/v3/objects/products`, `POST /crm/v3/objects/quotes`, and the associations API. Any breaking change in HubSpot's API shape fails CI fast.

**Manual QA matrix.** Documented in a companion `docs/superpowers/runbooks/hubspot-qa.md` (created in phase 1):
- First-time setup (property provisioning, developer-project deploy).
- Seed push with empty HubSpot product library.
- HubSpot edit → review queue → each resolution option.
- App Card render in all three states; pricer-first link modal with dedupe.
- Approval end-to-end with a real manager click in the test account.
- Supersede, terminal state webhooks.

## Deployment and Setup

**Environment.** Added to the pricer's existing environment:
- `HUBSPOT_ACCESS_TOKEN` — the private app's token (from the developer project deploy)
- `HUBSPOT_PORTAL_ID`
- `HUBSPOT_WEBHOOK_SECRET` — signature verification on inbound webhooks
- `HUBSPOT_APP_FUNCTION_SHARED_SECRET` — shared between App Functions and the pricer's `/api/hubspot/card/*` endpoints

**Developer project deploy.** Separate from the Next.js app's Railway deploy. Deployed to Ninja's HubSpot portal via `hs project upload`. CI can automate this against a staging portal; production deploy is gated on admin approval.

**One-time setup script.** `scripts/hubspot-setup.ts`, run once per environment against Ninja's HubSpot portal. Idempotent. Creates custom properties, verifies scopes, confirms webhook subscriptions are live.

**Go-live sequence.**
1. Pricer team finalizes catalog inside the pricer (the work that's happening now).
2. Deploy the developer project to HubSpot; run `hubspot-setup.ts`.
3. In the pricer admin, enable the HubSpot integration in `HubSpotConfig` (flag `enabled = true`).
4. Click "Sync to HubSpot" — first push populates HubSpot's product library.
5. Spot-check HubSpot. If anything looks wrong, disable the integration, fix, re-run.
6. HubSpot admin configures the approval workflow against the contract in the Approval Flow section.
7. A pilot rep runs a test quote end-to-end on a real Deal in the test portal.
8. Promote to production.

## Open Questions and Future Work

- **Scenario-level aggregate rails** for cases where per-product rails all pass but the deal as a whole is still too thin. Separate spec if needed.
- **Stage-triggered automation** (phase 2 entry point): HubSpot Workflow that creates a pricer task when a Deal hits "Quote Needed" — a thin follow-up once the phase-1 App Card is stable.
- **Omni tier / usage-based quote representation** — revisit once Omni is in scope with a design for how tier structures show up on a HubSpot Quote.
- **Payment-collection round-trip** — we record terminal quote states today; payment-received events may warrant separate handling when HubSpot's payment integration matures.
- **Multi-portal / marketplace distribution** — refactor from private app to OAuth public app if the pricer is ever white-labeled.
- **Auto-void on supersede** — current design leaves the old HubSpot Quote visible with `pricer_supersedes` stamped. If sales reports customer confusion from stale links, add an auto-void step on supersede.
