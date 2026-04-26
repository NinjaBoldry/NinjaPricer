# Ninja Pricer — Forward Backlog

> Running list of deferred work items. Each entry names the source (the phase or spec that deferred it) and a one-line rationale. Items move out of this file when they become a planned phase; the entry is replaced with a link to the phase plan.

Phases already shipped are not listed here — consult `git log` and `docs/superpowers/plans/`.

---

## Engine / Product

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

### Scenario sharing / collaboration

- **Source:** [v1 design "Out of v1"](specs/2026-04-17-ninja-pricer-v1-design.md)
- **Why deferred:** v1 model is single-owner per scenario. Multi-owner ACL + activity + comments is its own phase.

## Platform

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
