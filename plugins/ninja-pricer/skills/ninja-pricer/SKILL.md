---
name: ninja-pricer
description: Help a Ninja Concepts sales rep or admin drive the Ninja Pricer MCP server — pricing lookups, scenario building, bundle application, quote generation, and (for admins) catalog edits. Use this whenever the user mentions Ninja Pricer, Ninja Notes, pricing scenarios, quotes, customer deals, workups, rails, margin, commissions, rate cards, or is clearly working inside the Ninja Concepts pricing workflow — even when they don't name the tool. Also use when the user asks "what would X cost," wants to compare pricing options, or needs to send a customer a quote.
---

# Ninja Pricer

Internal cost-and-pricing simulator for Ninja Concepts' sales team. Sales reps build workups for prospective customers — seat counts, persona mixes, bundled services, contract length — and the engine computes cost, revenue, contribution margin, commissions, and net margin, flagging deals that fall below admin-set rails. Admins configure the catalog: products, rates, personas, labor rates, commission rules, rails, bundles.

You're operating through the Ninja Pricer MCP server, which exposes the same data and behavior as the web admin UI. Your token's role (admin or sales) determines which tools you can see. Trust `tools/list` — it filters automatically; don't attempt tools that aren't there.

## Core concepts

- **Scenario** — a sales rep's workup for one prospect. Has a customer name, contract length (months), SaaS tab configs (seat count + persona mix per product), and labor lines (training or professional services).
- **Bundle** — a named preset of SaaS configs + labor items that can be applied to a scenario to seed its tabs in one call.
- **Rails** — admin-set floors (min contribution margin %, max discount %, min seat price, min contract length). Soft rails emit warnings; hard rails block the write.
- **Quote** — an immutable PDF + frozen totals snapshot generated from a scenario. Each call to `generate_quote` writes a new `version` row.
- **Persona mix** — a distribution of user types within a SaaS seat count (e.g., 60% power users, 40% standard). Must sum to exactly 100.
- **Rate snapshot** — the full set of reference data (rates, personas, rails, commissions) passed to `compute_quote`. `get_product` returns everything you need to build one.

## Money: integer cents, end-to-end

All monetary outputs are integer cents. A `contractRevenueCents: 120000` is **$1,200.00**. When reporting to the user, format with a dollar sign and two decimal places. When the schema asks for a dollar value as input, prefer a **string** over a number (`"0.1234"` beats `0.1234`) — avoids floating-point drift on fields like `discountPct` and `ratePct`.

Fractions (`marginPctContribution`, `discountPct`, `ratePct`) are 0..1. `0.25` means 25%.

## Tool surface at a glance

Group mental model: **reads** answer questions without writing anything; **scenario writes** let a rep build and finalize a workup; **admin catalog writes** change the rules of the game.

### Reads (all users)
- `list_products` / `get_product` — catalog + full rate card per product
- `list_bundles` / `get_bundle` — saved bundles with their items
- `list_scenarios` / `get_scenario` — own scenarios (sales) or all (admin)
- `list_quotes_for_scenario` / `get_quote` — quote history. `get_quote` supports `include_pdf_bytes: true` to inline the customer PDF (admin also gets internal PDF bytes).
- `compute_quote` — **pure, no DB write.** Takes a full ComputeRequest shape and returns the engine's result. Use this for "what if" questions when the user doesn't want a scenario persisted yet.

### Scenario writes (all users, own scenarios only for sales)
- `create_scenario` → `update_scenario` (header patches) → `archive_scenario`
- `set_scenario_saas_config` (upsert one product's SaaS tab) / `set_scenario_labor_lines` (**replaces** all labor lines for a product)
- `apply_bundle_to_scenario` (seed configs + labor lines from a bundle; sets `appliedBundleId`)
- `generate_quote` → returns `{quoteId, version, downloadUrl, customerPdfBase64?, internalPdfBase64?}`. Add `include_pdf_bytes: true` to get the PDF inline.

### Admin reads
- `list_employees` / `get_employee` — comp + department + active flag
- `list_departments` — includes computed loaded hourly rate
- `list_burdens` — FICA/FUTA/SUTA rates + scope + caps
- `list_commission_rules` / `get_commission_rule` — rules + tier breakdown
- `list_api_tokens` — all tokens across the org (kill-switch view)

### Admin catalog writes
- **Product shell:** `create_product`, `update_product`, `delete_product`
- **SaaS rate card:** vendor rates (create/update/delete), personas (create/update/delete), fixed costs (create/update/delete), `set_base_usage`, `set_other_variable`, `set_product_scale`, `set_list_price`, `set_volume_tiers`, `set_contract_modifiers`
- **Labor:** labor SKUs (create/update/delete), departments (create/update/delete + `set_department_bill_rate`), employees (create/update/delete), burdens (create/update/delete)
- **Commissions:** commission rules (create/update/delete), `set_commission_tiers`
- **Bundles:** bundles (create/update/delete), `set_bundle_items`
- **Rails:** `create_rail`, `update_rail`, `delete_rail`

User management (invite, role change, delete) is not exposed via MCP — it lives in the web admin UI at `/admin/users`. If the user asks you to create a user or change a role, tell them to do it in the web UI.

## Collection-replace semantics

Several tools **replace an entire collection in one call** — they don't merge or append. This matches how the admin UI edits these as a batch and avoids multi-call races.

| Tool | Replaces |
|---|---|
| `set_scenario_labor_lines` | All labor lines for a `(scenarioId, productId)` pair |
| `set_base_usage` | All base-usage entries for a product |
| `set_volume_tiers` | All volume tiers for a product |
| `set_contract_modifiers` | All contract-length modifiers for a product |
| `set_commission_tiers` | All tiers for a commission rule |
| `set_bundle_items` | All items for a bundle |

**Practical implication:** to change one item, `get_*` the current list, mutate client-side, then `set_*` the full new list. The caller is responsible for round-tripping additions and deletions — if they "forget" an existing item, it's gone.

## Common workflows

### "What would this cost?" — fast pricing question

User says something like "what's 75 seats of Ninja Notes over 24 months with a power-user-heavy mix?"

1. `list_products` → find the product id (Ninja Notes)
2. `get_product({id})` → pull the full rate-card snapshot: vendor rates, base usage, personas, fixed costs, list price, volume tiers, contract modifiers, rails
3. Build a `compute_quote` input:
   - `contractMonths: 24`
   - `tabs: [{kind: 'SAAS_USAGE', productId, seatCount: 75, personaMix: [{personaId: <heavy-user-id>, pct: 70}, {personaId: <standard-id>, pct: 30}]}]`
   - `products.saas` populated with the snap from `get_product`
   - `commissionRules: []` + `rails: []` if they only want the price, not commissions/warnings — or populate them for the full picture
4. `compute_quote({...})` → report contract revenue, cost, contribution margin, net margin, any rail warnings
5. Explain the margin call-out in plain English. E.g. "at these inputs the contribution margin is 38% — comfortably above the 25% soft floor."

Nothing is persisted. Great for iterating on inputs out loud.

### Build a real scenario and generate a quote

User: "Build me a workup for Acme — 50 Ninja Notes seats, 12 months, apply the Pilot bundle."

1. `create_scenario({name: 'Acme', customerName: 'Acme Inc', contractMonths: 12})` → `{id: scenarioId}`
2. Option A (bundle): `apply_bundle_to_scenario({scenarioId, bundleId})` — seeds SaaS configs and labor lines from the bundle, sets `appliedBundleId`
3. Option B (manual): `set_scenario_saas_config({scenarioId, productId, seatCount: 50, personaMix: [...]})` — then `set_scenario_labor_lines({scenarioId, productId, lines: [...]})` for any labor
4. Pause if the user wants to review before quoting. `get_scenario({id: scenarioId})` shows the full state.
5. `generate_quote({scenarioId, include_pdf_bytes: true})` → `{quoteId, version, downloadUrl, customerPdfBase64}`
6. Hand the PDF back to the user: attach the bytes directly, or offer the `downloadUrl` for them to fetch with their bearer.

If the user is admin and wants the internal-summary PDF (with cost, margin, commissions), they get `internalPdfBase64` too. Sales users only get the customer PDF.

### Admin: bump a rail threshold

User: "Raise the Ninja Notes min-margin soft threshold to 30%."

1. `list_products` → find Ninja Notes id
2. `get_product({id})` → inspect current rails. Find the rail with `kind: 'MIN_MARGIN_PCT'`, note its id.
3. `update_rail({id: railId, softThreshold: '0.30'})` — pass as string to avoid float drift. Omit fields you're not changing.
4. Confirm to the user: "Soft threshold raised to 30%. Hard threshold stays at X%." Deals below 30% margin will now warn sales; deals below the hard threshold still block.

### Admin: update a commission tier structure

User: "Change the house commission to 5% on the first $100k, 8% above."

1. `list_commission_rules` → find the rule (scope: ALL or whichever scope the user means)
2. `get_commission_rule({id})` → confirm the current tiers and base metric
3. `set_commission_tiers({ruleId, tiers: [{thresholdFromUsd: '0', ratePct: '0.05'}, {thresholdFromUsd: '100000', ratePct: '0.08'}]})`
4. Thresholds MUST be non-decreasing (`0 ≤ 100000 ≤ ...`). Zod rejects non-monotone input with `-32602`.
5. Tiers are progressive (marginal) — the first $100k gets 5%, every dollar above gets 8%.

### Admin: add a product + rate card from scratch

A multi-step workflow. Do it in this order to avoid references to things that don't exist yet:

1. `create_product({name, kind: 'SAAS_USAGE'})` → get new product id
2. Vendor rates (one per third-party usage-based cost): `create_vendor_rate({productId, name, unitLabel, rateUsd})` — repeat per rate
3. `set_base_usage({productId, entries: [{vendorRateId, usagePerMonth}, ...]})` — baseline usage assumed per seat
4. `set_other_variable({productId, usdPerUserPerMonth})` — infra/tooling overhead per seat
5. Personas: `create_persona({productId, name, multiplier, sortOrder})` — a "heavy" persona might be `multiplier: 2.5`
6. Fixed costs: `create_fixed_cost({productId, name, monthlyUsd})` — licenses, etc.
7. `set_product_scale({productId, activeUsersAtScale})` — the denominator for fixed-cost amortization
8. `set_list_price({productId, usdPerSeatPerMonth})`
9. `set_volume_tiers({productId, tiers: [...]})` — discount at each seat threshold
10. `set_contract_modifiers({productId, modifiers: [...]})` — additional discount per contract length
11. Rails (one per floor): `create_rail({productId, kind, marginBasis, softThreshold, hardThreshold})`

## Error decoding

When you see an error in a tool result, translate it for the user instead of parroting the raw JSON-RPC code.

| Code | Meaning | What to tell the user |
|---|---|---|
| `-32001 Unauthorized` | Token missing, revoked, or expired | "Your API token isn't valid. Check `/settings/tokens` — it may have been revoked, or you need a new one." |
| `-32002 Forbidden` | Sales token hit an admin-only tool | "That action needs an admin token. Your current token is sales-role." |
| `-32003 Rail hard-block` | A write violated a hard rail | Quote the rail kind, measured value, and threshold. Explain the rail is an admin-set floor. Offer options: adjust inputs to clear the rail, or ask admin to revisit the threshold. |
| `-32004 Not found` | Entity doesn't exist, OR (if sales) doesn't belong to the caller | If sales user asking about a scenario: "I don't see that scenario — it may belong to another user, or the id is wrong." Don't assume auth failure; 404-on-leak is intentional. |
| `-32602 Invalid params` | Zod rejected the input | The message names the field. Often: `personaMix` didn't sum to 100, `thresholdFromUsd` wasn't non-decreasing, a Decimal field got a bad string. Fix the input and retry. |
| `-32603 Internal error` | Unexpected server error | "Something went wrong server-side. Ask your Ninja Concepts admin to check the logs." Don't retry blindly. |

## Sales vs admin — a quick matrix

Some things sales can't do via MCP. Instead of trying and failing, recognize the ask and redirect:

- **"Add a new product / rate / rail"** → admin only. If sales asks, say "That's an admin-only action. Ask your admin to add it, or open `/admin/products` if you have admin."
- **"Change commission structure"** → admin only. Same framing.
- **"Invite a user"** → nobody via MCP. Web UI only (`/admin/users`).
- **"See another rep's scenario"** → admin only via `get_scenario`. Sales get `-32004` on non-owned scenarios.
- **"Bulk-export pricing"** → no bulk-export tool. Use `list_products` + per-product `get_product` in a loop.
- **"See everyone's active tokens"** → `list_api_tokens` is admin-only.

If a sales user clearly wants to do an admin-only thing, don't run through `tools/list` failing each one — just say "that needs an admin token" and stop.

## Dealing with `compute_quote` input size

`compute_quote` takes a full `ComputeRequest` snapshot — for a multi-product, commission-aware calculation this is easily 10–30 KB. That's fine over HTTP. Build it up by calling `get_product` for each product the user mentions, `list_commission_rules`, then assembling the object. You can skip `commissionRules: []` and `rails: []` if the user only wants raw totals.

For an already-persisted scenario, **don't use `compute_quote`**. Use `get_scenario` to inspect it and tell the user it already has computed results available via the web UI's live summary, or call `generate_quote` to freeze a new version.

## How to ask good clarifying questions

Before calling `compute_quote` or `create_scenario`, you often need info the user hasn't given. Rather than bombing them with 8 questions at once:

- **Defaults are your friend.** If they say "50 seats of Ninja Notes" and don't mention contract length, assume 12 months and say so: "Assuming 12 months — say the word if you want a different term." They'll correct you if wrong.
- **Persona mix is usually safe to default to "the typical mix."** Call `get_product` and pick the personas; if there are sortOrder fields, use index 0 as the dominant one at 60% and split the rest evenly. Say "I used a typical persona mix — want me to break it down differently?"
- **Commissions and rails don't matter for quick pricing questions.** Only include them if the user asked for margin or commission numbers.

Save the multi-part follow-ups for when you're building a real scenario the user plans to quote.

## Setup help for the human

If the user is confused about why tools aren't showing up:

1. **They need a token.** Direct them to `/settings/tokens` on their Ninja Pricer deploy → "New token" → copy the `np_live_...` value (shown once).
2. **They paste the token into their MCP client.** For Claude Code: add `ninja-pricer` to their MCP config pointing at `https://<deploy>/api/mcp` with `Authorization: Bearer np_live_...`. For Cowork / Claude.ai: the connector config lives wherever they manage MCP servers.
3. **Role is inherited from the user.** Admin in the web UI = admin on MCP. Sales = sales. A user demoted in the web UI loses admin tool access on their next MCP request without needing a new token.
4. **If a token suddenly stops working:** check `/settings/tokens` — it may have been revoked. Admins can also check `/admin/api-tokens` for cross-user view + audit log.
