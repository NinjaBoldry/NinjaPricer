# Phase 2b — Deployment + Smoke Test

## Prerequisites

- Phase 2a deployed (Product/Bundle have description + sku).
- Classic/Developer-Project private app token configured as `HUBSPOT_ACCESS_TOKEN` in Railway.

## Deploy steps

1. Add `HUBSPOT_WEBHOOK_SECRET` to Railway env. The value is the Developer Project app's **Client Secret** (visible on the app's Auth tab).
2. Add `HUBSPOT_APP_ID=37357889` to Railway env (used for the echo filter).
3. From `hubspot-project/` run `hs project upload`. Build + deploy; then open the Distribution tab and click **Reinstall** to re-approve the new webhook-related scopes (if any).
4. Confirm webhook subscriptions are active in HubSpot: Settings → Integrations → Private Apps → Ninja Pricer → Webhooks tab.

## Smoke test (end-to-end)

1. Link a pricer scenario to a real HubSpot Deal via `/scenarios/<id>` → HubSpot section.
2. Click **Publish to HubSpot**. Verify:
   - HubSpot Deal now has an associated Quote.
   - Pricer's `/admin/hubspot/published-quotes` shows a new row with state `PUBLISHED` and a shareable URL.
3. In HubSpot, open the Quote and transition its `hs_status` to a terminal state (e.g., manually set to `ACCEPTED`).
4. Within ~5 seconds, pricer's `/admin/hubspot/webhook-events` shows a new event with `processedAt` set; the quote row on `/admin/hubspot/published-quotes` shows `lastStatus = ACCEPTED`.
5. Move the Deal to `closedwon`. Same verification for `dealOutcome = WON`.

## Troubleshooting

- **401 from webhook endpoint:** signature mismatch. Confirm `HUBSPOT_WEBHOOK_SECRET` matches the app's **Client Secret** (not the access token). Confirm the URL HubSpot is calling matches `HUBSPOT_WEBHOOK_URL_QUOTE`/`HUBSPOT_WEBHOOK_URL_DEAL` (defaults to production Railway URL).
- **Event received but not processed:** check `/admin/hubspot/webhook-events`. Failed rows have `processingError` populated. Click **Retry** to re-process.
- **Quote publish fails with `MissingDealLinkError`:** link the scenario to a Deal first.
- **Quote publish fails with `UnresolvedHardRailOverrideError`:** scenario has hard-rail overrides. Phase 2c implements approval. For now, remove the override or adjust pricing to pass rails.

## Approval flow (Phase 2c)

Phase 2c adds hard-rail-override approval routing. Setup requires configuring a HubSpot Workflow — see [hubspot-phase-2c-workflow.md](./hubspot-phase-2c-workflow.md).
