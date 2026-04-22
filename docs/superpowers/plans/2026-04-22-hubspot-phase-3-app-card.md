# HubSpot Phase 3 — App Card on Deal Records — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rep opens a HubSpot Deal → sees a "Ninja Pricer" card in the right sidebar → clicks "Build Quote" (new scenario) or "Continue in Pricer" (existing) or sees quote status (published). Card reads/writes pricer state via App Functions that proxy to new `/api/hubspot/card/*` endpoints gated by a shared secret.

**Architecture:** React App Card in `hubspot-project/src/app/cards/` rendering three states (no scenario / linked, not published / published). Three App Functions serve as a server-side proxy — they forward the card's requests to the pricer with a `X-Ninja-Card-Secret` header. The pricer's `/api/hubspot/card/*` endpoints verify that header and delegate to existing service-layer code (`runPublishScenario`, `HubSpotQuoteRepository`, `Scenario` reads).

**Tech Stack:** HubSpot Developer Platform 2026.03 (React UI Extensions, App Functions, `@hubspot/ui-extensions`, `hs project upload`), Next.js 14 App Router for the API endpoints, existing pricer services.

**Spec reference:** [docs/superpowers/specs/2026-04-21-hubspot-integration-design.md — "HubSpot Developer Project" and "App Card UX (phase 1)" sections](../specs/2026-04-21-hubspot-integration-design.md)

**Out of scope:**
- Rich dedupe modal for pricer-first "Create new Deal" flow (Phase 4)
- Local dev server for card development (`hs project dev`) — docs pointer only; setup is per-dev
- Card rendered on Contact or Company records (Phase 1 decision: Deal only)

---

## File Structure

**Created:**
```
app/api/hubspot/card/state/route.ts                    — GET card state for a dealId
app/api/hubspot/card/state/route.test.ts
app/api/hubspot/card/link/route.ts                     — POST link scenario to deal
app/api/hubspot/card/link/route.test.ts
app/api/hubspot/card/publish/route.ts                  — POST publish scenario
app/api/hubspot/card/publish/route.test.ts

lib/hubspot/card/auth.ts                               — shared-secret verification for card endpoints
lib/hubspot/card/auth.test.ts

hubspot-project/src/app/cards/ninja-pricer-card.tsx    — React App Card component
hubspot-project/src/app/cards/ninja-pricer-card-hsmeta.json

hubspot-project/src/app/functions/get-card-state.ts    — App Function: proxy state request
hubspot-project/src/app/functions/link-deal.ts         — App Function: proxy link request
hubspot-project/src/app/functions/publish-quote.ts     — App Function: proxy publish request

docs/superpowers/runbooks/hubspot-phase-3-appcard.md   — deployment + smoke-test runbook
```

**Modified:**
```
.env.example                                           — document HUBSPOT_APP_FUNCTION_SHARED_SECRET + PRICER_APP_URL
hubspot-project/src/app/app-hsmeta.json                — add permittedUrls for the pricer production URL
docs/superpowers/runbooks/hubspot-phase-2b.md          — pointer to phase-3 runbook
```

---

## Task 1: Pricer card-state API endpoint

**Files:**
- Create: `app/api/hubspot/card/state/route.ts`
- Create: `app/api/hubspot/card/state/route.test.ts`

- [ ] **Step 1.1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/hubspot/card/auth', () => ({
  verifyCardSecret: vi.fn(() => true),
}));

const findScenarioByDeal = vi.fn();
const findLatestQuote = vi.fn();
vi.mock('@/lib/db/client', () => ({
  prisma: {
    scenario: { findFirst: (...args: unknown[]) => findScenarioByDeal(...args) },
  },
}));
vi.mock('@/lib/db/repositories/hubspotQuote', () => ({
  HubSpotQuoteRepository: class {
    findLatestByScenario = findLatestQuote;
  },
}));

describe('POST /api/hubspot/card/state', () => {
  beforeEach(() => {
    findScenarioByDeal.mockReset();
    findLatestQuote.mockReset();
    process.env.HUBSPOT_APP_FUNCTION_SHARED_SECRET = 'test-secret';
  });

  it('401 when shared secret is missing/invalid', async () => {
    const { verifyCardSecret } = await import('@/lib/hubspot/card/auth');
    (verifyCardSecret as unknown as { mockReturnValue: (v: boolean) => void }).mockReturnValue(false);
    const res = await POST(
      new Request('http://x/api/hubspot/card/state', {
        method: 'POST',
        body: JSON.stringify({ dealId: 'd1' }),
      }) as Request,
    );
    expect(res.status).toBe(401);
  });

  it('returns { state: "no_scenario" } when no scenario is linked', async () => {
    findScenarioByDeal.mockResolvedValue(null);
    const res = await POST(
      new Request('http://x/api/hubspot/card/state', {
        method: 'POST',
        headers: { 'x-ninja-card-secret': 'test-secret' },
        body: JSON.stringify({ dealId: 'd1' }),
      }) as Request,
    );
    const body = await res.json();
    expect(body.state).toBe('no_scenario');
  });

  it('returns { state: "linked_no_quote", scenarioId, ... } when scenario exists but no HubSpot quote', async () => {
    findScenarioByDeal.mockResolvedValue({ id: 's1', name: 'Acme Q1', updatedAt: new Date('2026-04-22T10:00:00Z') });
    findLatestQuote.mockResolvedValue(null);
    const res = await POST(
      new Request('http://x/api/hubspot/card/state', {
        method: 'POST',
        headers: { 'x-ninja-card-secret': 'test-secret' },
        body: JSON.stringify({ dealId: 'd1' }),
      }) as Request,
    );
    const body = await res.json();
    expect(body.state).toBe('linked_no_quote');
    expect(body.scenarioId).toBe('s1');
    expect(body.scenarioName).toBe('Acme Q1');
  });

  it('returns { state: "published", shareableUrl, lastStatus, ... } when quote exists', async () => {
    findScenarioByDeal.mockResolvedValue({ id: 's1', name: 'Acme Q1', updatedAt: new Date() });
    findLatestQuote.mockResolvedValue({
      id: 'q1',
      hubspotQuoteId: 'hs-q-1',
      revision: 2,
      publishState: 'PUBLISHED',
      shareableUrl: 'https://hs/q',
      lastStatus: 'SENT',
    });
    const res = await POST(
      new Request('http://x/api/hubspot/card/state', {
        method: 'POST',
        headers: { 'x-ninja-card-secret': 'test-secret' },
        body: JSON.stringify({ dealId: 'd1' }),
      }) as Request,
    );
    const body = await res.json();
    expect(body.state).toBe('published');
    expect(body.shareableUrl).toBe('https://hs/q');
    expect(body.revision).toBe(2);
  });
});
```

- [ ] **Step 1.2: Implement**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCardSecret } from '@/lib/hubspot/card/auth';
import { prisma } from '@/lib/db/client';
import { HubSpotQuoteRepository } from '@/lib/db/repositories/hubspotQuote';

const bodySchema = z.object({ dealId: z.string().min(1) });

export async function POST(req: Request): Promise<NextResponse> {
  if (!verifyCardSecret(req.headers)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const scenario = await prisma.scenario.findFirst({
    where: { hubspotDealId: parsed.data.dealId },
    orderBy: { updatedAt: 'desc' },
  });

  if (!scenario) return NextResponse.json({ state: 'no_scenario' });

  const quote = await new HubSpotQuoteRepository(prisma).findLatestByScenario(scenario.id);

  if (!quote || quote.publishState === 'DRAFT') {
    return NextResponse.json({
      state: 'linked_no_quote',
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      scenarioUpdatedAt: scenario.updatedAt.toISOString(),
      pricerUrl: `${process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app'}/scenarios/${scenario.id}/hubspot`,
    });
  }

  if (quote.publishState === 'PENDING_APPROVAL') {
    return NextResponse.json({
      state: 'pending_approval',
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      pricerUrl: `${process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app'}/scenarios/${scenario.id}/hubspot`,
    });
  }

  if (quote.publishState === 'APPROVAL_REJECTED') {
    return NextResponse.json({
      state: 'approval_rejected',
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      pricerUrl: `${process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app'}/scenarios/${scenario.id}/hubspot`,
    });
  }

  return NextResponse.json({
    state: 'published',
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    hubspotQuoteId: quote.hubspotQuoteId,
    shareableUrl: quote.shareableUrl,
    revision: quote.revision,
    lastStatus: quote.lastStatus,
    dealOutcome: quote.dealOutcome,
    pricerUrl: `${process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app'}/scenarios/${scenario.id}/hubspot`,
  });
}
```

- [ ] **Step 1.3: Run + commit**

```bash
npm test -- app/api/hubspot/card/state/route.test.ts
git add app/api/hubspot/card/state
git commit -m "feat(hubspot): card state endpoint (returns no_scenario/linked_no_quote/pending_approval/approval_rejected/published)"
```

---

## Task 2: Shared-secret auth helper

**Files:**
- Create: `lib/hubspot/card/auth.ts`
- Create: `lib/hubspot/card/auth.test.ts`

- [ ] **Step 2.1: Write failing tests**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { verifyCardSecret } from './auth';

describe('verifyCardSecret', () => {
  beforeEach(() => {
    process.env.HUBSPOT_APP_FUNCTION_SHARED_SECRET = 'expected-secret';
  });

  it('true when X-Ninja-Card-Secret matches env', () => {
    const headers = new Headers({ 'x-ninja-card-secret': 'expected-secret' });
    expect(verifyCardSecret(headers)).toBe(true);
  });

  it('false when header missing', () => {
    expect(verifyCardSecret(new Headers())).toBe(false);
  });

  it('false when header does not match', () => {
    const headers = new Headers({ 'x-ninja-card-secret': 'wrong' });
    expect(verifyCardSecret(headers)).toBe(false);
  });

  it('false when env is unset', () => {
    delete process.env.HUBSPOT_APP_FUNCTION_SHARED_SECRET;
    const headers = new Headers({ 'x-ninja-card-secret': 'anything' });
    expect(verifyCardSecret(headers)).toBe(false);
  });
});
```

- [ ] **Step 2.2: Implement**

```ts
import { timingSafeEqual } from 'node:crypto';

export function verifyCardSecret(headers: Headers): boolean {
  const expected = process.env.HUBSPOT_APP_FUNCTION_SHARED_SECRET;
  if (!expected) return false;

  const provided = headers.get('x-ninja-card-secret');
  if (!provided) return false;
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
```

- [ ] **Step 2.3: Run + commit**

```bash
npm test -- lib/hubspot/card/auth.test.ts
git add lib/hubspot/card
git commit -m "feat(hubspot): shared-secret verification for App Card → pricer endpoints"
```

---

## Task 3: Card link-deal endpoint

**Files:**
- Create: `app/api/hubspot/card/link/route.ts`
- Create: `app/api/hubspot/card/link/route.test.ts`

- [ ] **Step 3.1: Implement test + route**

The endpoint creates a new scenario linked to the given dealId (if one doesn't already exist) and returns the scenario ID. Since the card's "Build Quote" flow opens pricer in a new tab, the endpoint primarily serves the use case where the card's "Build Quote" is clicked and a fresh scenario should be scaffolded.

Follow the pattern from Task 1. Endpoint takes `{ dealId, customerName }`. Returns `{ scenarioId, pricerUrl }`.

```ts
// route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCardSecret } from '@/lib/hubspot/card/auth';
import { prisma } from '@/lib/db/client';
import { auth } from '@/auth';  // may or may not be available server-side; see note below

const bodySchema = z.object({
  dealId: z.string().min(1),
  customerName: z.string().trim().min(1),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  if (!verifyCardSecret(req.headers)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  // Check for an existing scenario linked to this deal
  const existing = await prisma.scenario.findFirst({
    where: { hubspotDealId: parsed.data.dealId },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) {
    return NextResponse.json({
      scenarioId: existing.id,
      pricerUrl: `${process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app'}/scenarios/${existing.id}/hubspot`,
      reused: true,
    });
  }

  // Create a new scenario. Owner is resolved via a dedicated "HubSpot card" service user that must exist in the DB.
  // This keeps the scenario audit trail attributed to the card's origin rather than a random admin user.
  const ownerEmail = process.env.HUBSPOT_CARD_SERVICE_USER_EMAIL ?? 'hubspot-card@ninjaconcepts.com';
  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    create: { email: ownerEmail, role: 'ADMIN' },
    update: {},
  });

  const scenario = await prisma.scenario.create({
    data: {
      name: `Quote for ${parsed.data.customerName}`,
      customerName: parsed.data.customerName,
      ownerId: owner.id,
      contractMonths: 12,
      hubspotDealId: parsed.data.dealId,
      hubspotCompanyId: parsed.data.companyId ?? null,
      hubspotPrimaryContactId: parsed.data.contactId ?? null,
    },
  });

  return NextResponse.json({
    scenarioId: scenario.id,
    pricerUrl: `${process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app'}/scenarios/${scenario.id}/hubspot`,
    reused: false,
  });
}
```

Test covers: 401 without secret, returns existing scenario when one exists, creates new scenario when none exists.

- [ ] **Step 3.2: Run + commit**

```bash
npm test -- app/api/hubspot/card/link/route.test.ts
git add app/api/hubspot/card/link
git commit -m "feat(hubspot): card link endpoint (creates or reuses scenario for dealId)"
```

**Note:** The endpoint's `ownerId` resolution via `HUBSPOT_CARD_SERVICE_USER_EMAIL` means an admin needs to seed a service user. The upsert creates it on first call if missing — no manual prep required. Admins wanting to attribute to the rep's actual user account can improve this in a future pass (Phase 4 scope).

---

## Task 4: Card publish endpoint

**Files:**
- Create: `app/api/hubspot/card/publish/route.ts`
- Create: `app/api/hubspot/card/publish/route.test.ts`

- [ ] **Step 4.1: Implement test + route**

Delegates to `runPublishScenario` (the same service the scenario admin page uses). Returns the discriminated result shape — `published` / `pending_approval` / `rejected` / `error`.

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCardSecret } from '@/lib/hubspot/card/auth';
import { runPublishScenario } from '@/lib/hubspot/quote/publishService';

const bodySchema = z.object({ scenarioId: z.string().min(1) });

export async function POST(req: Request): Promise<NextResponse> {
  if (!verifyCardSecret(req.headers)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const result = await runPublishScenario({
    scenarioId: parsed.data.scenarioId,
    correlationIdPrefix: 'card-publish',
  });

  return NextResponse.json(result);
}
```

Tests: 401 without secret, forwards result shape for each branch (published, pending_approval, rejected, error).

- [ ] **Step 4.2: Run + commit**

```bash
npm test -- app/api/hubspot/card/publish/route.test.ts
git add app/api/hubspot/card/publish
git commit -m "feat(hubspot): card publish endpoint (delegates to runPublishScenario)"
```

---

## Task 5: HubSpot App Function — get-card-state

**Files:**
- Create: `hubspot-project/src/app/functions/get-card-state.ts`

- [ ] **Step 5.1: Implement function**

HubSpot App Functions run inside HubSpot's Node.js runtime. They have access to the app's installation context (deal ID via the request payload) and can make outbound HTTPS calls — but only to URLs whitelisted in `app-hsmeta.json`'s `permittedUrls.fetch`.

```ts
// hubspot-project/src/app/functions/get-card-state.ts
type Request = {
  context: { crm: { objectId: string; objectTypeId: string } };
  parameters?: Record<string, unknown>;
};

type Response = {
  statusCode: number;
  body: Record<string, unknown>;
};

export async function main(request: Request): Promise<Response> {
  const dealId = request.context?.crm?.objectId;
  if (!dealId) {
    return { statusCode: 400, body: { error: 'dealId missing from context' } };
  }

  const secret = process.env.NINJA_CARD_SECRET;
  const pricerUrl = process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app';
  if (!secret) {
    return { statusCode: 500, body: { error: 'NINJA_CARD_SECRET not configured' } };
  }

  const res = await fetch(`${pricerUrl}/api/hubspot/card/state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ninja-Card-Secret': secret,
    },
    body: JSON.stringify({ dealId }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { statusCode: res.status, body };
}
```

- [ ] **Step 5.2: Register as a serverless function**

App Functions in HubSpot Developer Projects need a `*-hsmeta.json` sibling OR they're registered via the card's `hsmeta.json`. See Step 8's card hsmeta — it lists the function by filename. No additional hsmeta file here.

- [ ] **Step 5.3: Commit**

```bash
git add hubspot-project/src/app/functions/get-card-state.ts
git commit -m "feat(hubspot): get-card-state App Function (proxies to pricer /api/hubspot/card/state)"
```

---

## Task 6: HubSpot App Function — link-deal

**Files:**
- Create: `hubspot-project/src/app/functions/link-deal.ts`

- [ ] **Step 6.1: Implement**

Mirror Task 5. The card passes `{ customerName, contactId?, companyId? }` via the `parameters` field. The App Function forwards to `/api/hubspot/card/link`. The deal ID comes from context.

```ts
// hubspot-project/src/app/functions/link-deal.ts
type Request = {
  context: { crm: { objectId: string } };
  parameters?: { customerName?: string; contactId?: string; companyId?: string };
};

type Response = { statusCode: number; body: Record<string, unknown> };

export async function main(request: Request): Promise<Response> {
  const dealId = request.context?.crm?.objectId;
  const params = request.parameters ?? {};
  if (!dealId || !params.customerName) {
    return { statusCode: 400, body: { error: 'dealId and customerName required' } };
  }

  const secret = process.env.NINJA_CARD_SECRET;
  const pricerUrl = process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app';
  if (!secret) {
    return { statusCode: 500, body: { error: 'NINJA_CARD_SECRET not configured' } };
  }

  const res = await fetch(`${pricerUrl}/api/hubspot/card/link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ninja-Card-Secret': secret,
    },
    body: JSON.stringify({
      dealId,
      customerName: params.customerName,
      contactId: params.contactId,
      companyId: params.companyId,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { statusCode: res.status, body };
}
```

- [ ] **Step 6.2: Commit**

```bash
git add hubspot-project/src/app/functions/link-deal.ts
git commit -m "feat(hubspot): link-deal App Function (creates-or-reuses scenario for deal)"
```

---

## Task 7: HubSpot App Function — publish-quote

**Files:**
- Create: `hubspot-project/src/app/functions/publish-quote.ts`

- [ ] **Step 7.1: Implement**

```ts
// hubspot-project/src/app/functions/publish-quote.ts
type Request = {
  context: { crm: { objectId: string } };
  parameters?: { scenarioId?: string };
};

type Response = { statusCode: number; body: Record<string, unknown> };

export async function main(request: Request): Promise<Response> {
  const scenarioId = request.parameters?.scenarioId;
  if (!scenarioId) {
    return { statusCode: 400, body: { error: 'scenarioId required' } };
  }

  const secret = process.env.NINJA_CARD_SECRET;
  const pricerUrl = process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app';
  if (!secret) {
    return { statusCode: 500, body: { error: 'NINJA_CARD_SECRET not configured' } };
  }

  const res = await fetch(`${pricerUrl}/api/hubspot/card/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ninja-Card-Secret': secret,
    },
    body: JSON.stringify({ scenarioId }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { statusCode: res.status, body };
}
```

- [ ] **Step 7.2: Commit**

```bash
git add hubspot-project/src/app/functions/publish-quote.ts
git commit -m "feat(hubspot): publish-quote App Function (forwards to pricer publish)"
```

---

## Task 8: App Card React component + hsmeta

**Files:**
- Create: `hubspot-project/src/app/cards/ninja-pricer-card.tsx`
- Create: `hubspot-project/src/app/cards/ninja-pricer-card-hsmeta.json`

- [ ] **Step 8.1: Create hsmeta**

```json
{
  "uid": "ninja-pricer-card",
  "type": "card",
  "config": {
    "name": "Ninja Pricer",
    "description": "Build, publish, and track Ninja Pricer quotes for this Deal.",
    "location": "crm.record.tab",
    "objectTypes": ["DEAL"],
    "entrypoint": "ninja-pricer-card.tsx",
    "functions": [
      { "name": "get-card-state", "source": "../functions/get-card-state.ts" },
      { "name": "link-deal", "source": "../functions/link-deal.ts" },
      { "name": "publish-quote", "source": "../functions/publish-quote.ts" }
    ]
  }
}
```

**Note on manifest syntax:** `hs project validate` will flag the exact expected schema if this draft is off. The precise `functions` array shape may need adjustment per platform 2026.03 — fix whatever it rejects.

- [ ] **Step 8.2: Implement React card**

```tsx
// hubspot-project/src/app/cards/ninja-pricer-card.tsx
import { useState, useEffect } from 'react';
import {
  hubspot,
  Button,
  Text,
  Flex,
  Link,
  Input,
  Alert,
  Divider,
  Heading,
  LoadingSpinner,
} from '@hubspot/ui-extensions';

type CardState =
  | { state: 'loading' }
  | { state: 'no_scenario' }
  | { state: 'linked_no_quote'; scenarioId: string; scenarioName: string; scenarioUpdatedAt: string; pricerUrl: string }
  | { state: 'pending_approval'; scenarioId: string; scenarioName: string; pricerUrl: string }
  | { state: 'approval_rejected'; scenarioId: string; scenarioName: string; pricerUrl: string }
  | { state: 'published'; scenarioId: string; scenarioName: string; hubspotQuoteId: string; shareableUrl?: string; revision: number; lastStatus?: string; dealOutcome?: string; pricerUrl: string }
  | { state: 'error'; message: string };

hubspot.extend(() => <NinjaPricerCard />);

function NinjaPricerCard() {
  const [state, setState] = useState<CardState>({ state: 'loading' });
  const [customerName, setCustomerName] = useState('');
  const [busy, setBusy] = useState(false);

  async function fetchState() {
    try {
      const res = await hubspot.serverless('get-card-state', {});
      setState(res.response?.body as CardState);
    } catch (e) {
      setState({ state: 'error', message: e instanceof Error ? e.message : 'unknown error' });
    }
  }

  useEffect(() => {
    fetchState();
  }, []);

  async function onBuildQuote() {
    setBusy(true);
    try {
      const res = await hubspot.serverless('link-deal', {
        parameters: { customerName: customerName || 'New Customer' },
      });
      const body = res.response?.body as { scenarioId?: string; pricerUrl?: string };
      if (body?.pricerUrl) window.open(body.pricerUrl, '_blank');
      await fetchState();
    } finally {
      setBusy(false);
    }
  }

  async function onPublish(scenarioId: string) {
    setBusy(true);
    try {
      await hubspot.serverless('publish-quote', { parameters: { scenarioId } });
      await fetchState();
    } finally {
      setBusy(false);
    }
  }

  if (state.state === 'loading') {
    return <Flex direction="column" gap="sm"><LoadingSpinner label="Loading quote state…" /></Flex>;
  }

  if (state.state === 'error') {
    return <Alert title="Error" variant="danger">{state.message}</Alert>;
  }

  if (state.state === 'no_scenario') {
    return (
      <Flex direction="column" gap="md">
        <Heading>Ninja Pricer</Heading>
        <Text>No quote yet for this Deal.</Text>
        <Input name="customerName" label="Customer name" value={customerName} onChange={setCustomerName} />
        <Button variant="primary" disabled={busy} onClick={onBuildQuote}>
          Build Quote
        </Button>
      </Flex>
    );
  }

  if (state.state === 'linked_no_quote') {
    return (
      <Flex direction="column" gap="md">
        <Heading>{state.scenarioName}</Heading>
        <Text>Scenario is linked. Last edited: {new Date(state.scenarioUpdatedAt).toLocaleString()}</Text>
        <Flex direction="row" gap="sm">
          <Link href={state.pricerUrl} external>Continue in Pricer</Link>
          <Button variant="primary" disabled={busy} onClick={() => onPublish(state.scenarioId)}>
            Publish to HubSpot
          </Button>
        </Flex>
      </Flex>
    );
  }

  if (state.state === 'pending_approval') {
    return (
      <Flex direction="column" gap="md">
        <Heading>{state.scenarioName}</Heading>
        <Alert title="Waiting on manager approval" variant="warning">
          A manager needs to approve before the quote can be sent.
        </Alert>
        <Link href={state.pricerUrl} external>View in Pricer</Link>
      </Flex>
    );
  }

  if (state.state === 'approval_rejected') {
    return (
      <Flex direction="column" gap="md">
        <Heading>{state.scenarioName}</Heading>
        <Alert title="Approval rejected" variant="danger">
          Revise the scenario to pass rails and resubmit.
        </Alert>
        <Link href={state.pricerUrl} external>Open in Pricer to revise</Link>
      </Flex>
    );
  }

  // state.state === 'published'
  return (
    <Flex direction="column" gap="md">
      <Heading>{state.scenarioName} — Rev {state.revision}</Heading>
      {state.shareableUrl && (
        <Link href={state.shareableUrl} external>Open HubSpot Quote</Link>
      )}
      <Text>Status: {state.lastStatus ?? 'Sent'}</Text>
      {state.dealOutcome && <Text>Deal outcome: {state.dealOutcome}</Text>}
      <Divider />
      <Link href={state.pricerUrl} external>Revise in Pricer</Link>
    </Flex>
  );
}
```

**Note on `hubspot.serverless()` and `window.open()`:** The HubSpot UI extensions SDK provides `hubspot.serverless(name, { parameters })` to call App Functions. `window` availability inside the card sandbox varies — if `window.open` is unavailable or restricted, use `<Link href={url} external>` rendering that the user clicks instead. Adjust during smoke testing.

- [ ] **Step 8.3: Validate manifest**

```bash
cd hubspot-project
hs project validate
```
Expected: SUCCESS. If not, adjust `ninja-pricer-card-hsmeta.json` per the error.

- [ ] **Step 8.4: Commit**

```bash
git add hubspot-project/src/app/cards
git commit -m "feat(hubspot): Ninja Pricer App Card with 5 render states"
```

---

## Task 9: App manifest — add permittedUrls

**Files:**
- Modify: `hubspot-project/src/app/app-hsmeta.json`

- [ ] **Step 9.1: Add Railway URL**

Open `hubspot-project/src/app/app-hsmeta.json`. The `permittedUrls.fetch` array currently lists only `https://api.hubapi.com`. Add the pricer's production URL so App Functions can call `/api/hubspot/card/*`:

```json
"permittedUrls": {
  "fetch": [
    "https://api.hubapi.com",
    "https://ninjapricer-production.up.railway.app"
  ],
  ...
}
```

- [ ] **Step 9.2: Validate**

```bash
cd hubspot-project
hs project validate
```

- [ ] **Step 9.3: Commit**

```bash
git add hubspot-project/src/app/app-hsmeta.json
git commit -m "feat(hubspot): permit App Functions to fetch pricer production URL"
```

---

## Task 10: Documentation + runbook

**Files:**
- Create: `docs/superpowers/runbooks/hubspot-phase-3-appcard.md`
- Modify: `.env.example`
- Modify: `docs/superpowers/runbooks/hubspot-phase-2b.md`

- [ ] **Step 10.1: Document env var**

Append to `.env.example`:

```
# Phase 3 — App Card
# Shared secret between HubSpot App Functions and pricer /api/hubspot/card/* endpoints.
# Generate a random 32-byte hex and set the same value in Railway AND in the HubSpot project's secret manager.
HUBSPOT_APP_FUNCTION_SHARED_SECRET=
# Optional — override the pricer's production URL (default: https://ninjapricer-production.up.railway.app)
PRICER_APP_URL=
# Optional — attribute scenarios created from the App Card to a specific user.
HUBSPOT_CARD_SERVICE_USER_EMAIL=
```

- [ ] **Step 10.2: Write runbook**

Create `docs/superpowers/runbooks/hubspot-phase-3-appcard.md`:

```md
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
```

- [ ] **Step 10.3: Cross-link from Phase 2b runbook**

Append to `docs/superpowers/runbooks/hubspot-phase-2b.md`:

```md
## App Card (Phase 3)

Phase 3 adds a native Ninja Pricer card to HubSpot Deal records so reps can build + publish quotes without leaving HubSpot. Setup: [hubspot-phase-3-appcard.md](./hubspot-phase-3-appcard.md).
```

- [ ] **Step 10.4: Commit**

```bash
git add .env.example docs/superpowers/runbooks
git commit -m "docs(hubspot): Phase 3 App Card deployment runbook + env vars"
```

---

## Task 11: Final verification

- [ ] **Step 11.1: Run verification gates**

```bash
npm test
npm run test:integration
npm run lint
npm run format:check
npm run build
```

Expected: all pass (the only new tests are for the card API endpoints + auth helper; App Card React + App Functions aren't tested via the pricer's vitest — they run in HubSpot's environment and are validated by `hs project validate` + manual smoke).

Fix any minor format/lint inline. Commit as `chore(hubspot): phase 3 lint + format`.

- [ ] **Step 11.2: Final validate of HubSpot project**

```bash
cd hubspot-project
hs project validate
```

Expected: `SUCCESS Project ninja-pricer is valid and ready to upload`.

- [ ] **Step 11.3: Confirm spec coverage**

Re-read the "App Card UX (phase 1)" section of the main integration spec. Confirm each state (no scenario, linked no quote, published — plus Phase 2c additions pending/rejected) is rendered by the card.

---

## Self-Review Notes

- **No unit tests on the card/functions:** HubSpot UI extensions and App Functions run in HubSpot's sandboxed runtime. They're smoke-tested via the deployed app + real HubSpot Deal. The pricer-side endpoints they call (`/api/hubspot/card/*`) ARE unit-tested with mocked shared-secret verification.
- **Shared secret hygiene:** 32 hex bytes generated on deploy; set in Railway AND HubSpot project secrets. Rotate by regenerating and updating both sides.
- **No Phase 3c for Deal context pre-population:** Task 3's link endpoint accepts optional `contactId` / `companyId` from the card, but the card currently doesn't supply them. Phase 4 can enrich the Build Quote flow with the Deal's primary contact/company.
- **Five states (including Phase 2c additions):** `no_scenario`, `linked_no_quote`, `pending_approval`, `approval_rejected`, `published`. The original spec had three but Phase 2c added the two approval states; this plan covers all five.
- **Service-user ownerId for card-created scenarios:** unattributed to the rep who clicked "Build Quote" from HubSpot. Acceptable for Phase 3; Phase 4 can thread the HubSpot owner ID → pricer user mapping through the card so scenarios show up under the rep's name.
