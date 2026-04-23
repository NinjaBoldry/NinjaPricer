# Phase 3 — App Card deployment + smoke test

## Design overview

The Phase 3 App Card is a **static launcher**: no App Functions, no server-side card calls, no
shared secrets. The card renders a single "Open in Ninja Pricer" link that sends the rep to
`/scenarios/from-deal?dealId=<dealId>`. The pricer handles auth, find-or-create, and redirects
the rep to the correct scenario view.

Flow:

1. Rep opens a Deal in HubSpot.
2. The Ninja Pricer card appears in the right sidebar and renders a link (no network call needed).
3. Rep clicks the link → browser opens the pricer at `/scenarios/from-deal?dealId=<dealId>`.
4. Pricer middleware enforces authentication — rep is prompted to sign in if not already.
5. `GET /scenarios/from-deal` finds an existing scenario linked to that `dealId`, or creates a new
   one owned by the authenticated rep.
6. Pricer redirects the rep to `/scenarios/<id>/hubspot`.

## Prerequisites

- Phase 2b + 2c deployed.
- HubSpot Developer Project already installed in the portal (earlier phases).
- `HUBSPOT_ACCESS_TOKEN` / `HUBSPOT_WEBHOOK_SECRET` / `HUBSPOT_APP_ID` already set in Railway.

No new secrets or service accounts required for this phase.

## Steps

### 1. No new secret setup required

The static launcher card requires no additional environment variables. The existing Railway
configuration is sufficient.

### 2. Deploy the project

```bash
cd hubspot-project
hs project upload
```

Expected: build succeeds, the simplified card is registered.

### 3. Reinstall in portal

HubSpot UI → Development → Projects → ninja-pricer → Ninja Pricer app → **Distribution** tab →
**Reinstall URL**. Click through and approve any scope changes.

If the card doesn't appear on Deal records after upload, force a reinstall via the reinstall URL.

### 4. Smoke test on a real Deal

1. HubSpot → open a Deal record.
2. Right sidebar should show a **"Ninja Pricer"** card with an "Open in Ninja Pricer" link.
3. Click the link — the pricer opens in a new tab.
4. If not already signed in, the pricer prompts for authentication.
5. On a Deal with no linked scenario: the pricer creates a new scenario and redirects to
   `/scenarios/<id>/hubspot`.
6. On a Deal with an existing linked scenario: the pricer redirects to that existing scenario.
7. Build or continue the quote in the pricer as normal.

### 5. Troubleshooting

- **Card shows a broken link or wrong URL** → check that `hubspot-project/src/app/cards/ninja-pricer-card.tsx`
  has the correct production hostname (`ninjapricer-production.up.railway.app`). Upload the project again.
- **Rep is redirected to sign-in** → expected behavior for unauthenticated reps. Ensure the rep
  has a pricer account and can sign in.
- **400 — "dealId required"** → the card is not passing `context.crm.objectId`. Verify the card
  is installed on Deal records (not Contacts or Companies).
- **500 on `/scenarios/from-deal`** → check Railway logs for database errors. Ensure the Railway
  database is reachable and migrations are current.

## Known limitations

- The card opens the pricer in a new browser tab. A future phase could embed the pricer via iframe.
- The scenario created via the card is owned by the authenticated rep. If multiple reps open the
  same Deal, the first rep's scenario is reused (find-or-create returns the most recently updated
  existing scenario).
- Only one scenario per Deal is surfaced — if multiple scenarios share the same `hubspotDealId`,
  the most recently updated one wins.
