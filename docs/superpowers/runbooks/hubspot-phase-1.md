# HubSpot Phase 1 — Manual QA Runbook

## Prerequisites

1. HubSpot Developer Test Account created.
2. **Primary path (platform 2026.03+):** Developer Project app — note the Client ID and Client Secret.
   `.env.local`:
   ```
   HUBSPOT_CLIENT_ID=<client id>
   HUBSPOT_CLIENT_SECRET=<client secret>
   HUBSPOT_PORTAL_ID=<portal id>
   RUN_HUBSPOT_INTEGRATION=true
   ```
3. **Fallback / legacy private-app path:** set `HUBSPOT_ACCESS_TOKEN` instead of the client-credentials vars. If `HUBSPOT_ACCESS_TOKEN` is set it takes priority and no token exchange happens.

## Run setup

```bash
npm run hubspot:setup
```

Expected: 10+ custom properties created across Products, Line Items, Deals, Quotes.

## Run integration test

```bash
npm run test:integration -- tests/integration/hubspot/
```

> **Destructive cleanup flag** — the integration test calls `prisma.hubSpotProductMap.deleteMany()` in `beforeAll` and `afterAll` to ensure a clean slate. This is gated behind `HUBSPOT_INTEGRATION_DESTRUCTIVE=true` to prevent accidental data loss when running against a shared portal. Only set this flag when targeting a dedicated test portal:
>
> ```bash
> HUBSPOT_INTEGRATION_DESTRUCTIVE=true npm run test:integration -- tests/integration/hubspot/
> ```

## Manual smoke

1. Start dev server: `npm run dev`
2. Visit `/admin/hubspot`. Set `HubSpotConfig.enabled = true` via DB console or upsert.
3. Click "Push catalog to HubSpot" on `/admin/hubspot/sync`.
4. Open HubSpot test portal → Settings → Products & Services. Verify products/bundles appear with `pricer_managed = true`.
5. In HubSpot, rename a product.
6. Back in pricer, click "Pull changes from HubSpot".
7. Visit `/admin/hubspot/review-queue`. The edit should appear.
8. Click "Accept" — the pricer product name should update to match.
