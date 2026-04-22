# Phase 3 — App Card deployment + smoke test

## Prerequisites

- Phase 2b + 2c deployed.
- HubSpot Developer Project already installed in the portal (earlier phases).
- `HUBSPOT_ACCESS_TOKEN` / `HUBSPOT_WEBHOOK_SECRET` / `HUBSPOT_APP_ID` already set in Railway.

## Steps

### 1. Generate the shared secret

```bash
openssl rand -hex 32
```

Record the output. You'll set it in TWO places:

- **Railway** → Pricer service → Variables → `HUBSPOT_APP_FUNCTION_SHARED_SECRET=<hex>`
- **HubSpot Developer Project secrets:**
  ```bash
  cd hubspot-project
  hs secret add NINJA_CARD_SECRET <paste-hex>
  ```

Optional:

- **Railway** → `PRICER_APP_URL=https://ninjapricer-production.up.railway.app` (or your production URL)
- **Railway** → `HUBSPOT_CARD_SERVICE_USER_EMAIL=hubspot-card@ninjaconcepts.com`

### 2. Deploy the project

```bash
cd hubspot-project
hs project upload
```

Expected: build succeeds, new card + functions are registered.

### 3. Reinstall in portal

HubSpot UI → Development → Projects → ninja-pricer → Ninja Pricer app → **Distribution** tab → **Reinstall URL**. Click through; approve any new scopes.

Note: the card is a "card" not a scope, so reinstall may or may not prompt. If the card doesn't appear on Deal records after upload, force a reinstall via the URL.

### 4. Smoke test on a real Deal

1. HubSpot → open a Deal record.
2. Right sidebar should show a **"Ninja Pricer"** tab. Click it.
3. On a Deal with no linked scenario: card shows "No quote yet" + customer name input + **Build Quote** button. Click → card link-deal function → pricer creates a scenario → opens pricer in new tab to `/scenarios/<id>/hubspot`.
4. Build the quote in pricer (add line items, set pricing). Return to HubSpot.
5. Refresh the card (or close and re-open the Deal). Card should now show "Scenario linked" state with **Continue in Pricer** + **Publish to HubSpot** buttons.
6. Click **Publish to HubSpot** → card publish-quote function → pricer creates the HubSpot Quote → card re-renders to "Published" state with link to the HubSpot Quote.
7. On the HubSpot Deal's "Quotes" tab, the new quote appears and can be sent.

### 5. Troubleshooting

- **Card shows "Error: fetch failed"** → App Function can't reach the pricer. Check the Railway URL is in `app-hsmeta.json`'s `permittedUrls.fetch`. Check `HUBSPOT_APP_FUNCTION_SHARED_SECRET` matches in both places.
- **Card never leaves "Loading…"** → `hubspot.serverless('get-card-state', ...)` is failing. Open HubSpot's "Logs" tab on the app to see App Function execution logs.
- **401 in App Function logs** → shared secret mismatch.
- **500 in App Function logs** → check pricer's Railway logs for stack traces.

## Known limitations

- Build Quote opens pricer in a new browser tab. A future phase could embed the pricer via iframe or route the entire flow through card UI.
- Card doesn't poll for state changes. Rep must refresh or re-open the Deal to see updates after publish.
- Only one scenario per Deal is supported by the card — if multiple scenarios exist, the card surfaces the most recently updated.
