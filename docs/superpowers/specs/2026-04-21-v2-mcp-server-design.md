# Ninja Pricer v2 — MCP Server — Design Spec

> Scoped for v2. Deferred from v1 per [the original design](./2026-04-17-ninja-pricer-v1-design.md). HubSpot integration is a separate, later effort and is explicitly out of scope here.

## Overview

Expose the Ninja Pricer pricing engine, scenario lifecycle, and catalog administration as an MCP server so Claude agents (Cowork, Claude Code, any MCP-capable client) can read pricing data, build scenarios, generate quotes, and — for admin-role callers — edit the product catalog. The server is embedded in the existing Next.js app as a single `/api/mcp` route, uses the official `@modelcontextprotocol/sdk` TypeScript library, and authenticates callers with per-user API tokens issued from the web UI.

No business logic is duplicated. Every MCP tool is a thin, Zod-validated wrapper over an existing `lib/services/*` function, reusing the same validation, typed errors, and role guards that the web UI already depends on.

## Goals

- A sales rep or admin can issue themselves an API token from the web UI and paste it into Cowork/Claude Code/etc.; from there, the agent can answer pricing questions, create scenarios, generate quotes, and (if admin) update the catalog.
- Every admin-UI operation on the catalog is available as an MCP tool (full parity) — except user management.
- Token-scoped RBAC matches the web UI's: a sales-role token cannot call admin-only tools, and revoking a user's admin role instantly strips admin-write capability from every token they own.
- Write operations are audit-logged; revoked tokens are a flag, not a delete, so the audit trail stays intact.
- The PDF rendering + storage built in Phase 4 is reused — `generate_quote` returns a download URL, and optionally inline bytes when the caller opts in.

## Non-Goals

- **HubSpot integration.** Agents orchestrate HubSpot-side effects via HubSpot's own MCP/API; Ninja Pricer does not hold HubSpot credentials. Separate design when that work starts.
- **Service-account tokens.** Every token in v2 is owned by a user. Machine-to-machine callers will be revisited alongside HubSpot work.
- **User-management via MCP.** `invite_user`, `set_user_role`, `delete_user` remain web-UI only.
- **Rate limiting, IP allowlists.** Out of scope for v2; revisit if abuse signals appear.
- **Resources (MCP's read-only resource concept).** All data access is modeled as tools to keep the surface uniform.
- **Streamable responses.** All tools return a single JSON payload; no long-running / streaming tools in v2.

## Architecture

**Transport.** MCP over Streamable HTTP. `stdio` is not supported; remote callers like Cowork require HTTP.

**Host.** A single Next.js Route Handler at `app/api/mcp/route.ts`. The handler is ~30 lines: it authenticates the request, initializes the MCP server with the registered tool set, and pipes the request body through the SDK. No shared state between requests.

**Code layout.**

```
app/api/mcp/route.ts           — HTTP entry point (auth + SDK wiring)
lib/mcp/
  server.ts                    — builds the MCP server, registers all tools
  auth.ts                      — bearer-token verification middleware
  context.ts                   — per-request context type {user, token}
  errors.ts                    — typed service-error → MCP JSON-RPC error mapping
  tools/
    reads.ts                   — the 9 sales+admin read tools
    adminReads.ts              — the 5 admin-only read tools
    scenarioWrites.ts          — the 7 scenario-write tools
    catalog/
      product.ts               — product shell CRUD
      saasRateCard.ts          — vendor rates / personas / list price / volume / contract
      labor.ts                 — labor SKUs, departments, employees, burdens
      commissions.ts           — rules + tiers
      bundles.ts               — bundles + items
      rails.ts                 — rails CRUD
lib/db/repositories/apiToken.ts
lib/db/repositories/apiAuditLog.ts
lib/services/apiToken.ts       — issue / revoke / list / verify
lib/services/apiAuditLog.ts    — append / list / filter
app/settings/tokens/           — user self-service token UI
app/admin/api-tokens/          — admin cross-user token view + audit-log drill-in
```

**Reuse.** Every tool handler body is:

```ts
async handler({ user, input }) {
  const validated = schema.parse(input);
  const result = await serviceFn(user, validated);
  await auditLog.append({ ... });  // writes only
  return result;
}
```

No Prisma imports in `lib/mcp/tools/*`. Services own validation + DB.

## Data Model Additions

### `ApiToken`

```prisma
model ApiToken {
  id           String    @id @default(cuid())
  label        String                                 // "Bo's Cowork", "iPad sales"
  tokenHash    String    @unique                      // SHA-256 of the raw token
  tokenPrefix  String                                 // first 8 chars, for UI ID
  ownerUserId  String                                 // NOT NULL — every token is a user's
  lastUsedAt   DateTime?
  revokedAt    DateTime?
  expiresAt    DateTime?
  createdAt    DateTime  @default(now())
  owner        User      @relation("TokenOwner", fields: [ownerUserId], references: [id], onDelete: Cascade)
  auditEntries ApiAuditLog[]
}
```

**Rules.**

- Raw token format: `np_live_` + 32 url-safe base64 characters. Shown once at creation; never recoverable. Regenerate if lost.
- `tokenHash` is indexed (unique); lookup is O(1) per request.
- `ownerUserId` cascades: deleting the user deletes all their tokens. Role is read from `owner.role` at request time, so demoting a user instantly strips admin capability from all their tokens.
- `revokedAt` is a flag; the row stays for audit integrity.

### `ApiAuditLog`

```prisma
model ApiAuditLog {
  id                String    @id @default(cuid())
  tokenId           String
  userId            String                           // denormalized from token at log-time
  toolName          String
  argsHash          String                           // SHA-256 of JSON-stringified args
  targetEntityType  String?                          // "Product" | "Scenario" | "Rail" | ...
  targetEntityId    String?
  result            AuditResult                      // OK | ERROR
  errorCode         String?
  createdAt         DateTime  @default(now())
  token             ApiToken  @relation(fields: [tokenId], references: [id], onDelete: Cascade)
  user              User      @relation("AuditActor", fields: [userId], references: [id])

  @@index([tokenId, createdAt])
  @@index([userId, createdAt])
}

enum AuditResult { OK ERROR }
```

Only WRITE tool calls append. Reads are not logged (volume + low risk). `argsHash` lets us group repeat calls without storing raw payloads (which may contain PII or rate data); raw args can be reconstructed from app logs if needed.

## Tool Surface

Every tool description (what the agent sees in `tools/list`) must include:
- One-sentence purpose.
- Role requirement if not sales-default (`"Admin only."` prefix).
- Side-effect note for writes (`"Writes to … Irreversible."` / `"Writes to … Reversible via {tool}."`).
- Non-obvious failure modes (e.g., `delete_product` fails if any scenario references it).

### Sales + admin — reads (9)

| Tool | Purpose |
|---|---|
| `list_products` | All products with `id`, `name`, `kind`, `isArchived`. |
| `get_product` | Full product snapshot. SaaS: vendor rates, base usage, personas, list price, volume tiers, contract modifiers, rails. Labor: SKUs or bill-rate. Admin sees additional fields (loaded rates). |
| `list_bundles` | Bundles with item counts. |
| `get_bundle` | Bundle + all items (SaaS configs, labor SKU refs, department/hour refs). |
| `list_scenarios` | Sales sees own; admin sees all. Filters: owner, status, customer (substring). |
| `get_scenario` | Scenario + all SaaS configs + labor lines + quote versions. |
| `list_quotes_for_scenario` | Quote versions for a scenario. |
| `get_quote` | Quote row with frozen totals JSON. Optional `include_pdf_bytes: bool` → returns `customerPdfBase64` and, for admin callers, `internalPdfBase64`. |
| `compute_quote` | **Pure.** Takes full `ComputeRequest`-shaped input plus a `contractMonths`, returns the engine's `ComputeResult`. No DB write. The "quick pricing" tool. |

### Admin — reads (5)

| Tool | Purpose |
|---|---|
| `list_employees` / `get_employee` | Compensation, department, active flag. |
| `list_departments` | With computed loaded rate. |
| `list_burdens` | FICA/FUTA/SUTA/etc. with caps and scope. |
| `list_commission_rules` / `get_commission_rule` | Rules + tier breakdown. |
| `list_api_tokens` | All non-revoked tokens across the org, for the kill-switch surface. |

### Sales + admin — scenario writes (7)

| Tool | Purpose |
|---|---|
| `create_scenario` | Creates an empty scenario. Returns `{ id }`. |
| `update_scenario` | Patch name, customer, contract months, notes, status. |
| `set_scenario_saas_config` | Upsert a SaaS tab: seat count, persona mix, discount override. |
| `set_scenario_labor_lines` | **Replaces** all labor lines for a given product on the scenario. |
| `apply_bundle_to_scenario` | Writes bundle items into scenario configs; sets `appliedBundleId`. |
| `archive_scenario` | Soft-archive. |
| `generate_quote` | Re-runs engine, writes PDFs + Quote row. Returns `{ quoteId, version, downloadUrl, customerPdfBase64?, internalPdfBase64? }`. Inline bytes opt-in via `include_pdf_bytes: bool`; internal bytes only for admin callers. |

### Admin — catalog writes (42)

**Principle:** `set_*` tools that manage a collection (tiers, items, volume tiers, contract modifiers, bundle items, commission tiers) **replace the whole set in one call**. Matches admin-UI edit batches; avoids multi-call races where the engine would see partial state.

| Domain | Tools |
|---|---|
| Product shell | `create_product`, `update_product`, `delete_product` |
| SaaS rate card | `create_vendor_rate`, `update_vendor_rate`, `delete_vendor_rate`, `set_base_usage`, `set_other_variable`, `create_persona`, `update_persona`, `delete_persona`, `create_fixed_cost`, `update_fixed_cost`, `delete_fixed_cost`, `set_product_scale`, `set_list_price`, `set_volume_tiers`, `set_contract_modifiers` |
| Labor | `create_labor_sku`, `update_labor_sku`, `delete_labor_sku`, `create_department`, `update_department`, `delete_department`, `set_department_bill_rate`, `create_employee`, `update_employee`, `delete_employee`, `create_burden`, `update_burden`, `delete_burden` |
| Commissions | `create_commission_rule`, `update_commission_rule`, `delete_commission_rule`, `set_commission_tiers` |
| Bundles | `create_bundle`, `update_bundle`, `delete_bundle`, `set_bundle_items` |
| Rails | `create_rail`, `update_rail`, `delete_rail` |

**Explicitly not exposed:** `invite_user`, `set_user_role`, `delete_user`. User management remains web-UI-only.

**Total tool count:** 9 + 5 + 7 + 42 = **63 tools**.

## Auth Flow

1. Client sends `POST /api/mcp` with header `Authorization: Bearer np_live_<raw>`.
2. `lib/mcp/auth.ts`:
   - Hash `np_live_<raw>` with SHA-256 → lookup `ApiToken` by `tokenHash`.
   - Reject if not found, `revokedAt != null`, or `expiresAt < now` → MCP error `-32001 Unauthorized`.
   - Load `owner` user; reject if owner is soft-deleted.
   - Fire-and-forget UPDATE of `lastUsedAt` (`setImmediate` or Next `after()` hook; does not block).
   - Attach `{ user, token }` to a per-request context passed to tool handlers.
3. MCP server dispatches: `tools/list` returns only tools the caller's role is allowed to see; calling a forbidden tool returns `-32002 Forbidden`.
4. Tool handler runs service call; errors map per the table below.
5. For WRITE tools, append an `ApiAuditLog` row with `{ tokenId, userId, toolName, argsHash, targetEntityType, targetEntityId, result, errorCode }`.

### Error Mapping

| Source | MCP JSON-RPC code | Message |
|---|---|---|
| Missing/invalid token | `-32001` | `Unauthorized` |
| Valid token, wrong role | `-32002` | `Forbidden: admin role required` |
| `RailHardBlockError` | `-32003` | `Rail hard-block: {rail}; measured {m} vs threshold {t}` |
| `NotFoundError` | `-32004` | `{Entity} not found: {id}` |
| Zod validation failure | `-32602` | `Invalid params: {field}: {reason}` |
| `ValidationError` (service) | `-32602` | `Invalid: {field}: {reason}` |
| Any other throw | `-32603` | `Internal error` (raw logged to Sentry; not returned) |

### Tool-listing RBAC

`tools/list` filters the returned set by role. A sales-role token sees 9 + 7 = 16 tools; admin sees all 63. This keeps agents from pattern-matching on tools they can't use and producing confusing "forbidden" loops.

## Token Management UI

**`/settings/tokens` — user self-service.**

- Table: label, prefix, created, last used, expires, revoked.
- "New token" modal: required label, optional expiry. On submit, show the raw `np_live_...` value exactly once with a big "copy" button and a red "I've saved this; close" button. Raw never re-displayed.
- "Revoke" button per row, confirm-modal.
- Empty state explains how to paste the token into Cowork / Claude Code MCP config.

**`/admin/api-tokens` — admin cross-org view.**

- Same table but columns include owner email + owner role.
- Filter: active / revoked / expired; owner.
- Row click opens a drawer showing the last 50 audit-log entries for that token + a "revoke" button.
- "Revoke all tokens for user X" action (useful when offboarding).

## PDF Handling

Inherits the Phase 4 infrastructure verbatim:

- `generate_quote` and `get_quote` with `include_pdf_bytes: true` read the existing file via `lib/utils/quoteStorage.readQuotePdfStream`, base64-encode the buffer, and return it on the response.
- `downloadUrl` is a pointer at the existing `/api/quotes/[quoteId]/download?variant={customer|internal}` route. That route already auth-gates via session; we add a parallel branch that accepts `Authorization: Bearer` tokens for machine callers (same bearer the MCP call used).
- Internal-variant bytes / download URL only returned when the caller's token belongs to an admin.

**Download route extension:** `app/api/quotes/[quoteId]/download/route.ts` adds bearer-token support before its existing session-based auth: if the `Authorization` header is present, verify via the MCP auth middleware; otherwise fall back to session auth.

## Testing Strategy

- **Unit tests per tool file** — Zod input rejection, role-gate, happy-path output shape, error mapping. Service mocks confirm the tool is passing through without adding logic.
- **Integration test on `/api/mcp`** — real Next route handler + test Postgres + real issued token. Covers: valid token flow, hash lookup, `lastUsedAt` bump, revoked/expired rejection, audit-log row on write, admin-only tool gated from sales token.
- **MCP protocol conformance** — spin up the route, connect with `@modelcontextprotocol/sdk` client, run `initialize` + `tools/list` + call 3 representative tools (`list_products`, `compute_quote`, `update_product`). Asserts we're emitting a valid MCP session, not a bespoke JSON shape.
- **Token lifecycle test** — issue, hash roundtrip, revoke, expire, role change invalidates admin capability without token rotation.

## Phasing

Three sub-phases, each shippable on its own:

- **Phase 5.0 — Scaffolding, auth, reads.** `ApiToken` + `ApiAuditLog` models, `/api/mcp` route, auth middleware, token-management UI (`/settings/tokens`, `/admin/api-tokens`), the 14 read tools, MCP protocol-conformance test. Deliverable: Cowork can answer pricing questions end-to-end.
- **Phase 5.1 — Scenario writes.** The 7 scenario-write tools + `/api/quotes/[id]/download` bearer-auth extension. Deliverable: Cowork can build scenarios and generate quotes on a sales rep's behalf.
- **Phase 5.2 — Catalog writes.** The 42 admin-write tools, grouped into 6 task batches by domain (product, SaaS rate card, labor, commissions, bundles, rails). Deliverable: admin can reconfigure the catalog from Cowork.

Each sub-phase gets its own spec → plan → review → implement cycle, matching the Phase 2–4 rhythm.

## Deployment & Secrets

- No new runtime secrets. Tokens are per-user, minted on-demand; nothing in env for MCP itself.
- Railway deploy unchanged — single service, same start command.
- First deploy after 5.0 lands requires a `prisma migrate deploy` run, which already runs in `npm start`.

## Open Questions / Assumptions

- **Tool description budget.** MCP `tools/list` payload grows with the surface. 63 tools × ~300 chars each = ~19 KB per list call. Cowork should handle this fine; if we ever see context bloat complaints we can split the surface into multiple "servers" (e.g., `ninja-pricer-read` and `ninja-pricer-admin`).
- **`set_*` collection-replace semantics** match the admin UI. If a caller wants to incrementally edit a bundle, they `get_bundle`, mutate the items array client-side, and `set_bundle_items`. Acceptable for chat-UX; revisit if agents struggle with large collections.
- **Audit log retention.** No TTL planned for v2. If `ApiAuditLog` grows unwieldy, add a monthly cron to prune > 180 days.
- **Rail hard-blocks on writes.** An admin tool that would violate a hard rail (e.g., `set_list_price` pushing a product below its hard-min margin) returns `-32003 Rail hard-block` and does not write. Matches admin-UI behavior.
