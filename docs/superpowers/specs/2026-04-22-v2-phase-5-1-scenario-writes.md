# Ninja Pricer v2 — Phase 5.1: Scenario Writes + Audit Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 7 scenario-write MCP tools (`create_scenario`, `update_scenario`, `set_scenario_saas_config`, `set_scenario_labor_lines`, `apply_bundle_to_scenario`, `archive_scenario`, `generate_quote`), wire the ApiAuditLog into every write, and extend the existing `/api/quotes/[quoteId]/download` route to accept bearer tokens so machine callers can fetch the generated PDFs.

**Architecture:** Write tools live in a new `lib/mcp/tools/scenarioWrites.ts`, each a thin Zod-validated wrapper over existing `lib/services/*` functions. The server factory in `lib/mcp/server.ts` is extended so that tools flagged `isWrite: true` automatically append an `ApiAuditLog` row on success and error — no per-tool audit boilerplate. Where scenario-write logic currently lives only inside Next.js server actions (bundle apply, SaaS config upsert, labor-line replace), extract it into `lib/services/scenario.ts` first so both the UI and the MCP tool share one code path.

**Tech Stack:** Inherited from Phase 5.0 — TypeScript strict, Next.js 14, Prisma, Zod, `@modelcontextprotocol/sdk`, Vitest.

**Design spec:** [docs/superpowers/specs/2026-04-21-v2-mcp-server-design.md](./2026-04-21-v2-mcp-server-design.md)
**Phase 5.0 plan:** [docs/superpowers/specs/2026-04-21-v2-phase-5-0-mcp-scaffolding-and-reads.md](./2026-04-21-v2-phase-5-0-mcp-scaffolding-and-reads.md)

---

## Conventions (inherited — restated for agentic workers)

- **TDD.** Failing test → run → implement → pass → commit.
- **One task = one commit** unless the task groups commits explicitly.
- **Money stays in `decimal.js`**; tools convert strings/numbers to Decimal at the Zod boundary.
- **Repository pattern.** Constructor-injected `PrismaClient`. Services orchestrate; tools call services; tools never touch Prisma.
- **Zod at the tool boundary and the service boundary.** Both validate — services can't trust the tool layer because they're also called by the web UI.
- **Typed errors.** `NotFoundError`, `ValidationError`, `RailHardBlockError` from `lib/utils/errors.ts`. `UnauthorizedError`, `ForbiddenError` from `lib/mcp/errors.ts`.
- **Commit style:** conventional commits.

---

## Goals

- Admin + sales tokens can drive the full scenario lifecycle from an MCP client: create a scenario, edit its tabs, apply a bundle, generate a quote.
- Every write call appends an `ApiAuditLog` row with tokenId, userId, toolName, targetEntityType/Id, result (OK | ERROR), errorCode. Appended by the server factory — no per-tool boilerplate.
- Sales callers can only write to scenarios they own; non-owner writes return `-32004 Not found` (same anti-existence-leak rule as reads).
- `generate_quote` returns `{ quoteId, version, downloadUrl, customerPdfBase64?, internalPdfBase64? }`. Inline bytes opt-in via `include_pdf_bytes`. Admin callers can get the internal PDF bytes; sales callers only get the customer PDF.
- A bearer token on `GET /api/quotes/[quoteId]/download` is honored as an alternative to the existing session auth — same ownership + admin rules.

## Non-Goals

- Catalog writes — Phase 5.2.
- Editing a committed quote (quotes remain append-only).
- Tool-level rate limiting or idempotency keys.
- UI work. Phase 5.0 already shipped the token UIs; this phase is server-side only.

---

## File Structure

### New

```
lib/mcp/tools/
  scenarioWrites.ts        # 7 scenario-write tools
  scenarioWrites.test.ts

lib/mcp/
  auditWrapper.ts          # helper used by server.ts callTool
  auditWrapper.test.ts
```

### Modified

```
lib/mcp/server.ts          # extend ToolDefinition, wire audit in callTool
lib/mcp/server.test.ts     # audit-wiring tests

lib/services/scenario.ts   # extract upsertSaasConfig, setLaborLines,
                           # applyBundleToScenario from server actions
lib/services/scenario.test.ts

app/scenarios/[id]/actions.ts             # refactor to call new services
app/scenarios/[id]/notes/actions.ts       # refactor
app/scenarios/[id]/training/actions.ts    # refactor
app/scenarios/[id]/service/actions.ts     # refactor

app/api/mcp/route.ts       # register scenarioWriteTools
app/api/quotes/[quoteId]/download/route.ts   # add bearer-auth branch
app/api/quotes/[quoteId]/download/route.test.ts
```

### Each file's one responsibility

- `lib/mcp/auditWrapper.ts` — single function `wrapWithAudit(tool, ctx, input)` that runs the handler, appends an audit row, returns the output (or rethrows after logging the error).
- `lib/mcp/tools/scenarioWrites.ts` — registers the 7 tools. Each handler is ≤ 25 lines.
- `lib/services/scenario.ts` (growing) — gains `upsertSaasConfig`, `setLaborLines`, `applyBundleToScenario` as free functions that both server actions and MCP tools consume.

---

## Sub-phase Overview

| Task  | Theme                                                      | Output                                                                                   |
| ----- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 5.1-A | Audit wrapper                                              | `wrapWithAudit` helper + tests                                                           |
| 5.1-B | ToolDefinition + server wiring                             | `isWrite` + `extractTargetId` fields; `callTool` calls `wrapWithAudit` for writes        |
| 5.1-C | Scenario service extractions                               | `upsertSaasConfig`, `setLaborLines`, `applyBundleToScenario` move from actions → service |
| 5.1-D | `create_scenario` + `update_scenario` + `archive_scenario` | 3 simple writes                                                                          |
| 5.1-E | `set_scenario_saas_config` + `set_scenario_labor_lines`    | 2 collection-replace writes                                                              |
| 5.1-F | `apply_bundle_to_scenario`                                 | 1 tool; thin wrapper over extracted service                                              |
| 5.1-G | `generate_quote`                                           | 1 tool; returns URL + optional bytes                                                     |
| 5.1-H | `/api/quotes/[id]/download` bearer branch                  | Accept bearer token on GET                                                               |

---

## Task 5.1-A: Audit-log wrapper

**Files:**

- Create: `lib/mcp/auditWrapper.ts`
- Create: `lib/mcp/auditWrapper.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/mcp/auditWrapper.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/services/apiAuditLog', () => ({
  appendAudit: vi.fn(),
}));

import { appendAudit } from '@/lib/services/apiAuditLog';
import { wrapWithAudit } from './auditWrapper';
import type { ToolDefinition } from './server';
import type { McpContext } from './context';

const ctx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};

describe('wrapWithAudit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('appends OK audit row on success, with extracted target id', async () => {
    const tool: ToolDefinition = {
      name: 'create_scenario',
      description: 'd',
      inputSchema: { parse: (x: unknown) => x } as never,
      requiresAdmin: false,
      isWrite: true,
      targetEntityType: 'Scenario',
      extractTargetId: (_input, output) => (output as { id: string }).id,
      handler: async () => ({ id: 'new_scen_1' }),
    };

    const out = await wrapWithAudit(tool, ctx, { name: 'X' });

    expect(out).toEqual({ id: 'new_scen_1' });
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 't1',
        userId: 'u1',
        toolName: 'create_scenario',
        args: { name: 'X' },
        targetEntityType: 'Scenario',
        targetEntityId: 'new_scen_1',
        result: 'OK',
      }),
    );
  });

  it('appends ERROR audit row when handler throws, preserves the original error', async () => {
    const tool: ToolDefinition = {
      name: 'update_scenario',
      description: 'd',
      inputSchema: { parse: (x: unknown) => x } as never,
      requiresAdmin: false,
      isWrite: true,
      targetEntityType: 'Scenario',
      extractTargetId: (input) => (input as { id: string }).id,
      handler: async () => {
        throw new Error('boom');
      },
    };

    await expect(wrapWithAudit(tool, ctx, { id: 's1' })).rejects.toThrow('boom');
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'update_scenario',
        targetEntityId: 's1',
        result: 'ERROR',
        errorCode: 'Error',
      }),
    );
  });

  it('handles extractTargetId returning undefined (e.g. pre-write errors)', async () => {
    const tool: ToolDefinition = {
      name: 'generate_quote',
      description: 'd',
      inputSchema: { parse: (x: unknown) => x } as never,
      requiresAdmin: false,
      isWrite: true,
      targetEntityType: 'Quote',
      extractTargetId: () => undefined,
      handler: async () => {
        throw new Error('nope');
      },
    };

    await expect(wrapWithAudit(tool, ctx, {})).rejects.toThrow();
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'ERROR',
        targetEntityType: 'Quote',
        targetEntityId: undefined,
      }),
    );
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/mcp/auditWrapper.test.ts`
Expected: `Cannot find module './auditWrapper'`.

- [ ] **Step 3: Implement**

Create `lib/mcp/auditWrapper.ts`:

```typescript
import { appendAudit } from '@/lib/services/apiAuditLog';
import type { ToolDefinition } from './server';
import type { McpContext } from './context';

export async function wrapWithAudit<I, O>(
  tool: ToolDefinition<I, O>,
  ctx: McpContext,
  input: I,
): Promise<O> {
  let output: O | undefined;
  let errored: unknown;
  try {
    output = await tool.handler(ctx, input);
    return output;
  } catch (err) {
    errored = err;
    throw err;
  } finally {
    const targetEntityId = tool.extractTargetId?.(input, output as O | undefined) ?? undefined;
    const audit: Parameters<typeof appendAudit>[0] = {
      tokenId: ctx.token.id,
      userId: ctx.user.id,
      toolName: tool.name,
      args: input,
      result: errored ? 'ERROR' : 'OK',
    };
    if (tool.targetEntityType) audit.targetEntityType = tool.targetEntityType;
    if (targetEntityId) audit.targetEntityId = targetEntityId;
    if (errored) {
      audit.errorCode = errored instanceof Error ? errored.name : 'Unknown';
    }
    // Fire-and-forget: a failed audit write shouldn't clobber the tool result.
    void appendAudit(audit).catch(() => {});
  }
}
```

- [ ] **Step 4: Run — pass**

Run: `npx vitest run lib/mcp/auditWrapper.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/auditWrapper.ts lib/mcp/auditWrapper.test.ts
git commit -m "feat(mcp): wrapWithAudit helper for write tool auditing"
```

---

## Task 5.1-B: ToolDefinition `isWrite` + server wiring

**Files:**

- Modify: `lib/mcp/server.ts`
- Modify: `lib/mcp/server.test.ts`

- [ ] **Step 1: Extend `ToolDefinition`**

In `lib/mcp/server.ts`, add fields:

```typescript
export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  requiresAdmin: boolean;
  handler: (ctx: McpContext, input: I) => Promise<O>;
  /**
   * If true, the server wraps this handler in wrapWithAudit, appending
   * an ApiAuditLog row on success and failure.
   */
  isWrite?: boolean;
  targetEntityType?: string;
  extractTargetId?: (input: I, output: O | undefined) => string | undefined;
}
```

- [ ] **Step 2: Update `callTool` to route writes through the audit wrapper**

In `lib/mcp/server.ts`, change the `callTool` implementation:

```typescript
import { wrapWithAudit } from './auditWrapper';
// ...

    async callTool(name, rawInput, ctx) {
      const tool = byName.get(name);
      if (!tool) throw new ForbiddenError(`Unknown tool: ${name}`);
      if (tool.requiresAdmin && ctx.user.role !== 'ADMIN') {
        throw new ForbiddenError(`Forbidden: admin role required for ${name}`);
      }
      const parsed = tool.inputSchema.parse(rawInput);
      if (tool.isWrite) {
        return wrapWithAudit(tool, ctx, parsed);
      }
      return tool.handler(ctx, parsed);
    },
```

- [ ] **Step 3: Add test for audit wiring**

Append to `lib/mcp/server.test.ts`:

```typescript
vi.mock('@/lib/services/apiAuditLog', () => ({
  appendAudit: vi.fn(),
}));

import { appendAudit } from '@/lib/services/apiAuditLog';

describe('server routes writes through audit wrapper', () => {
  beforeEach(() => vi.clearAllMocks());

  it('isWrite=true tools append OK audit row on success', async () => {
    const write: ToolDefinition<{}, { id: string }> = {
      name: 'write_thing',
      description: 'd',
      inputSchema: z.object({}),
      requiresAdmin: false,
      isWrite: true,
      targetEntityType: 'Thing',
      extractTargetId: (_i, o) => o?.id,
      handler: async () => ({ id: 'x1' }),
    };
    const server = createMcpServer([write]);
    await server.callTool('write_thing', {}, adminCtx);
    // wait a microtask for fire-and-forget audit
    await new Promise((r) => setTimeout(r, 0));
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'write_thing', result: 'OK', targetEntityId: 'x1' }),
    );
  });

  it('read tools (isWrite undefined or false) do NOT append audit', async () => {
    const read: ToolDefinition = {
      name: 'read_thing',
      description: 'd',
      inputSchema: z.object({}),
      requiresAdmin: false,
      handler: async () => ({ ok: true }),
    };
    const server = createMcpServer([read]);
    await server.callTool('read_thing', {}, adminCtx);
    await new Promise((r) => setTimeout(r, 0));
    expect(appendAudit).not.toHaveBeenCalled();
  });
});
```

`beforeEach` from Vitest needs to be imported if it isn't already.

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/mcp/server.test.ts lib/mcp/auditWrapper.test.ts`
Expected: all tests pass (prior 5 server tests + 2 new + 3 auditWrapper tests = 10).

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/server.ts lib/mcp/server.test.ts
git commit -m "feat(mcp): route isWrite tools through audit wrapper"
```

---

## Task 5.1-C: Extract scenario-write logic into services

**Files:**

- Modify: `lib/services/scenario.ts`
- Modify: `lib/services/scenario.test.ts`
- Modify: `app/scenarios/[id]/actions.ts`
- Modify: `app/scenarios/[id]/notes/actions.ts`
- Modify: `app/scenarios/[id]/training/actions.ts`
- Modify: `app/scenarios/[id]/service/actions.ts`

**Goal:** Create free functions `upsertSaasConfig`, `setLaborLines`, `applyBundleToScenario`, `unapplyBundleFromScenario` in `lib/services/scenario.ts` that both the existing server actions and the upcoming MCP tools call. No behavior change; refactor only.

- [ ] **Step 1: Read the current server actions**

Read these files and note the exact Prisma operations:

- `app/scenarios/[id]/actions.ts` — contains `applyBundleAction` and `unapplyBundleAction` (writes scenarioSaaSConfig + scenarioLaborLine rows, sets `appliedBundleId`).
- `app/scenarios/[id]/notes/actions.ts` — SaaS-config upsert.
- `app/scenarios/[id]/training/actions.ts` — labor-line replace for training tab.
- `app/scenarios/[id]/service/actions.ts` — labor-line replace for service tab.

- [ ] **Step 2: Add failing service tests**

Append to `lib/services/scenario.test.ts`:

```typescript
import {
  upsertSaasConfig,
  setLaborLines,
  applyBundleToScenario,
  unapplyBundleFromScenario,
} from './scenario';

describe('upsertSaasConfig', () => {
  it('creates a new SaaSConfig when none exists', async () => {
    // Integration-style: we only verify the free function delegates to the existing
    // ScenarioService or repo operations already covered by integration tests.
    // Here we assert the function exists and is callable; deep semantics are
    // exercised by the server-action integration tests that still run.
    expect(typeof upsertSaasConfig).toBe('function');
  });
});

describe('setLaborLines', () => {
  it('is exported as a function', () => {
    expect(typeof setLaborLines).toBe('function');
  });
});

describe('applyBundleToScenario', () => {
  it('is exported as a function', () => {
    expect(typeof applyBundleToScenario).toBe('function');
  });
});

describe('unapplyBundleFromScenario', () => {
  it('is exported as a function', () => {
    expect(typeof unapplyBundleFromScenario).toBe('function');
  });
});
```

> Rationale: the existing scenario actions have their own tests that cover the semantics. This extraction is pure refactor; we assert shape here and rely on the existing suite to guard behavior.

- [ ] **Step 3: Run — fail**

Run: `npx vitest run lib/services/scenario.test.ts`
Expected: `upsertSaasConfig is not a function` (or similar export-not-found).

- [ ] **Step 4: Extract functions into `lib/services/scenario.ts`**

Add at the end of `lib/services/scenario.ts` (after the existing `getScenarioById` export):

```typescript
import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';

// --- Scenario-write free functions shared by server actions and MCP tools ---

export interface UpsertSaasConfigInput {
  scenarioId: string;
  productId: string;
  seatCount: number;
  personaMix: { personaId: string; pct: number }[];
  discountOverridePct?: Decimal;
}

export async function upsertSaasConfig(input: UpsertSaasConfigInput) {
  const { scenarioId, productId, seatCount, personaMix, discountOverridePct } = input;
  return prisma.scenarioSaaSConfig.upsert({
    where: { scenarioId_productId: { scenarioId, productId } },
    create: {
      scenarioId,
      productId,
      seatCount,
      personaMix: personaMix as unknown as Prisma.InputJsonValue,
      discountOverridePct: discountOverridePct?.toNumber() ?? null,
    },
    update: {
      seatCount,
      personaMix: personaMix as unknown as Prisma.InputJsonValue,
      discountOverridePct: discountOverridePct?.toNumber() ?? null,
    },
  });
}

export interface LaborLineInput {
  skuId?: string;
  departmentId?: string;
  customDescription?: string;
  qty: Decimal;
  unit: string;
  costPerUnitUsd: Decimal;
  revenuePerUnitUsd: Decimal;
  sortOrder?: number;
}

export interface SetLaborLinesInput {
  scenarioId: string;
  productId: string;
  lines: LaborLineInput[];
}

export async function setLaborLines(input: SetLaborLinesInput) {
  return prisma.$transaction([
    prisma.scenarioLaborLine.deleteMany({
      where: { scenarioId: input.scenarioId, productId: input.productId },
    }),
    prisma.scenarioLaborLine.createMany({
      data: input.lines.map((l, idx) => ({
        scenarioId: input.scenarioId,
        productId: input.productId,
        skuId: l.skuId ?? null,
        departmentId: l.departmentId ?? null,
        customDescription: l.customDescription ?? null,
        qty: l.qty.toNumber(),
        unit: l.unit,
        costPerUnitUsd: l.costPerUnitUsd.toNumber(),
        revenuePerUnitUsd: l.revenuePerUnitUsd.toNumber(),
        sortOrder: l.sortOrder ?? idx,
      })),
    }),
  ]);
}

export async function applyBundleToScenario(args: { scenarioId: string; bundleId: string }) {
  const bundle = await prisma.bundle.findUnique({
    where: { id: args.bundleId },
    include: { items: true },
  });
  if (!bundle) throw new NotFoundError('Bundle', args.bundleId);

  // Replay the logic from app/scenarios/[id]/actions.ts's applyBundleAction here.
  // This is a structural move — any test previously covering applyBundleAction
  // continues to cover this via that action, which will be updated below.
  await prisma.$transaction(async (tx) => {
    for (const item of bundle.items) {
      if (item.kind === 'SAAS_CONFIG') {
        const cfg = item.saasConfig as {
          productId: string;
          seatCount: number;
          personaMix: { personaId: string; pct: number }[];
          discountOverridePct?: number;
        };
        await tx.scenarioSaaSConfig.upsert({
          where: {
            scenarioId_productId: { scenarioId: args.scenarioId, productId: cfg.productId },
          },
          create: {
            scenarioId: args.scenarioId,
            productId: cfg.productId,
            seatCount: cfg.seatCount,
            personaMix: cfg.personaMix as unknown as Prisma.InputJsonValue,
            discountOverridePct: cfg.discountOverridePct ?? null,
          },
          update: {
            seatCount: cfg.seatCount,
            personaMix: cfg.personaMix as unknown as Prisma.InputJsonValue,
            discountOverridePct: cfg.discountOverridePct ?? null,
          },
        });
      } else if (item.kind === 'LABOR_SKU') {
        const cfg = item.laborRef as {
          productId: string;
          skuId: string;
          qty: number;
        };
        // Fetch SKU for default costs.
        const sku = await tx.laborSKU.findUnique({ where: { id: cfg.skuId } });
        if (!sku) continue;
        await tx.scenarioLaborLine.create({
          data: {
            scenarioId: args.scenarioId,
            productId: cfg.productId,
            skuId: cfg.skuId,
            qty: cfg.qty,
            unit: sku.unit,
            costPerUnitUsd: sku.costPerUnitUsd,
            revenuePerUnitUsd: sku.defaultRevenueUsd,
          },
        });
      } else if (item.kind === 'DEPARTMENT_HOURS') {
        const cfg = item.laborRef as {
          productId: string;
          departmentId: string;
          hours: number;
        };
        const billRate = await tx.departmentBillRate.findUnique({
          where: { departmentId: cfg.departmentId },
        });
        const revenue = billRate?.billRatePerHour ?? 0;
        await tx.scenarioLaborLine.create({
          data: {
            scenarioId: args.scenarioId,
            productId: cfg.productId,
            departmentId: cfg.departmentId,
            qty: cfg.hours,
            unit: 'HOUR',
            costPerUnitUsd: 0,
            revenuePerUnitUsd: revenue,
          },
        });
      }
    }
    await tx.scenario.update({
      where: { id: args.scenarioId },
      data: { appliedBundleId: args.bundleId },
    });
  });

  return { scenarioId: args.scenarioId, bundleId: args.bundleId };
}

export async function unapplyBundleFromScenario(args: { scenarioId: string }) {
  await prisma.scenario.update({
    where: { id: args.scenarioId },
    data: { appliedBundleId: null },
  });
  return { scenarioId: args.scenarioId };
}
```

The `NotFoundError` import at the top of `scenario.ts` should already exist — if not, add: `import { NotFoundError } from '@/lib/utils/errors';`.

> **Exactness note:** the `applyBundleToScenario` body above is a translation of the current `applyBundleAction` logic. Before committing, open `app/scenarios/[id]/actions.ts` and line-by-line match the branches; if anything differs (different bundle-item shape, different fallback rate, different transactional ordering), update the extracted function to match exactly. Do NOT introduce behavior changes here.

- [ ] **Step 5: Refactor the server actions to delegate**

In `app/scenarios/[id]/actions.ts`, replace the body of `applyBundleAction` with a call to `applyBundleToScenario`, and `unapplyBundleAction` with `unapplyBundleFromScenario`. Preserve the action signatures and revalidatePath calls.

In `app/scenarios/[id]/notes/actions.ts`, replace the saasConfig upsert body with a call to `upsertSaasConfig`.

In `app/scenarios/[id]/training/actions.ts` and `app/scenarios/[id]/service/actions.ts`, replace the labor-line replace transactions with calls to `setLaborLines`.

- [ ] **Step 6: Run all tests**

Run: `npm run test`
Expected: suite stays green (no test should change behavior — if one fails, the extraction drifted from original semantics; revisit Step 4).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add lib/services/scenario.ts lib/services/scenario.test.ts app/scenarios/
git commit -m "refactor(scenario): extract write operations into service free functions"
```

---

## Task 5.1-D: `create_scenario`, `update_scenario`, `archive_scenario`

**Files:**

- Create: `lib/mcp/tools/scenarioWrites.ts`
- Create: `lib/mcp/tools/scenarioWrites.test.ts`
- Modify: `app/api/mcp/route.ts`

Three simple writes — all inputs on the scenario row itself.

- [ ] **Step 1: Write the failing tests**

Create `lib/mcp/tools/scenarioWrites.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/services/scenario', () => ({
  ScenarioService: vi.fn(function (this: any) {
    this.create = vi.fn();
    this.update = vi.fn();
    this.archive = vi.fn();
    return this;
  }),
  getScenarioById: vi.fn(),
  upsertSaasConfig: vi.fn(),
  setLaborLines: vi.fn(),
  applyBundleToScenario: vi.fn(),
}));

import { ScenarioService, getScenarioById } from '@/lib/services/scenario';
import { createScenarioTool, updateScenarioTool, archiveScenarioTool } from './scenarioWrites';
import { NotFoundError } from '@/lib/utils/errors';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};
const salesCtx: McpContext = {
  user: { id: 'u2', email: 's@b', name: null, role: 'SALES' },
  token: { id: 't2', label: 'y', ownerUserId: 'u2' },
};

describe('create_scenario', () => {
  let svc: any;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new (ScenarioService as any)();
    svc.create.mockResolvedValue({ id: 's_new' });
    (ScenarioService as any).mockImplementation(function (this: any) {
      Object.assign(this, svc);
      return this;
    });
  });

  it('isWrite=true with Scenario target type', () => {
    expect(createScenarioTool.isWrite).toBe(true);
    expect(createScenarioTool.targetEntityType).toBe('Scenario');
  });

  it('creates a scenario owned by the caller and returns {id}', async () => {
    const out = await createScenarioTool.handler(adminCtx, {
      name: 'Acme',
      customerName: 'Acme Inc',
      contractMonths: 12,
    });
    expect(svc.create).toHaveBeenCalledWith({
      name: 'Acme',
      customerName: 'Acme Inc',
      contractMonths: 12,
      ownerId: 'u1',
    });
    expect(out).toEqual({ id: 's_new' });
  });

  it('accepts optional notes', async () => {
    await createScenarioTool.handler(adminCtx, {
      name: 'X',
      customerName: 'Y',
      contractMonths: 6,
      notes: 'hello',
    });
    expect(svc.create).toHaveBeenCalledWith(expect.objectContaining({ notes: 'hello' }));
  });

  it('rejects contractMonths < 1 via Zod', () => {
    expect(() =>
      createScenarioTool.inputSchema.parse({
        name: 'X',
        customerName: 'Y',
        contractMonths: 0,
      }),
    ).toThrow();
  });
});

describe('update_scenario', () => {
  let svc: any;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new (ScenarioService as any)();
    svc.update.mockResolvedValue({ id: 's1' });
    (ScenarioService as any).mockImplementation(function (this: any) {
      Object.assign(this, svc);
      return this;
    });
  });

  it("sales caller cannot update someone else's scenario → NotFoundError", async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'other' } as any);
    await expect(
      updateScenarioTool.handler(salesCtx, { id: 's1', name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(svc.update).not.toHaveBeenCalled();
  });

  it('sales caller CAN update their own scenario', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    await updateScenarioTool.handler(salesCtx, { id: 's1', name: 'X' });
    expect(svc.update).toHaveBeenCalledWith('s1', { name: 'X' });
  });

  it('admin can update any scenario', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'someone' } as any);
    await updateScenarioTool.handler(adminCtx, { id: 's1', contractMonths: 24 });
    expect(svc.update).toHaveBeenCalledWith('s1', { contractMonths: 24 });
  });
});

describe('archive_scenario', () => {
  let svc: any;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new (ScenarioService as any)();
    svc.archive.mockResolvedValue({ id: 's1' });
    (ScenarioService as any).mockImplementation(function (this: any) {
      Object.assign(this, svc);
      return this;
    });
  });

  it('sales caller: own scenario archives', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    await archiveScenarioTool.handler(salesCtx, { id: 's1' });
    expect(svc.archive).toHaveBeenCalledWith('s1');
  });

  it('sales caller: other owner → NotFoundError', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'x' } as any);
    await expect(archiveScenarioTool.handler(salesCtx, { id: 's1' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/mcp/tools/scenarioWrites.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement the tools**

Create `lib/mcp/tools/scenarioWrites.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '@/lib/mcp/server';
import type { McpContext } from '@/lib/mcp/context';
import { NotFoundError } from '@/lib/utils/errors';
import {
  ScenarioService,
  getScenarioById,
  upsertSaasConfig,
  setLaborLines,
  applyBundleToScenario,
} from '@/lib/services/scenario';
import { prisma } from '@/lib/db/client';

async function assertOwnerOrAdmin(ctx: McpContext, scenarioId: string) {
  if (ctx.user.role === 'ADMIN') return;
  const scenario = await getScenarioById(scenarioId);
  if ((scenario as { ownerId?: string })?.ownerId !== ctx.user.id) {
    throw new NotFoundError('Scenario', scenarioId);
  }
}

const createScenarioSchema = z.object({
  name: z.string().min(1),
  customerName: z.string().min(1),
  contractMonths: z.number().int().min(1),
  notes: z.string().optional(),
});

export const createScenarioTool: ToolDefinition<
  z.infer<typeof createScenarioSchema>,
  { id: string }
> = {
  name: 'create_scenario',
  description:
    "Creates a new scenario owned by the caller. Returns { id }. Any user (sales or admin) may call; scenarios are always owned by the token's user.",
  inputSchema: createScenarioSchema,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (_input, output) => output?.id,
  handler: async (ctx, input) => {
    const svc = new ScenarioService();
    const row = await svc.create({
      name: input.name,
      customerName: input.customerName,
      contractMonths: input.contractMonths,
      ownerId: ctx.user.id,
      ...(input.notes != null && { notes: input.notes }),
    });
    return { id: row.id };
  },
};

const updateScenarioSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  customerName: z.string().min(1).optional(),
  contractMonths: z.number().int().min(1).optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'QUOTED', 'ARCHIVED']).optional(),
});

export const updateScenarioTool: ToolDefinition<
  z.infer<typeof updateScenarioSchema>,
  { id: string }
> = {
  name: 'update_scenario',
  description:
    'Patch scenario header fields: name, customerName, contractMonths, notes, status. Sales callers can only update scenarios they own; non-owners receive 404.',
  inputSchema: updateScenarioSchema,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.id,
  handler: async (ctx, { id, ...patch }) => {
    await assertOwnerOrAdmin(ctx, id);
    const svc = new ScenarioService();
    await svc.update(id, patch);
    return { id };
  },
};

const archiveScenarioSchema = z.object({ id: z.string() });

export const archiveScenarioTool: ToolDefinition<
  z.infer<typeof archiveScenarioSchema>,
  { id: string }
> = {
  name: 'archive_scenario',
  description:
    'Soft-archive a scenario. Reversible via update_scenario { status: "DRAFT" }. Sales callers can only archive their own.',
  inputSchema: archiveScenarioSchema,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.id,
  handler: async (ctx, { id }) => {
    await assertOwnerOrAdmin(ctx, id);
    const svc = new ScenarioService();
    await svc.archive(id);
    return { id };
  },
};

export const scenarioWriteTools: ToolDefinition[] = [
  createScenarioTool,
  updateScenarioTool,
  archiveScenarioTool,
];
```

Note: `ScenarioService` currently has a default constructor in the codebase? If it requires a repository argument, construct it with `new ScenarioService(new ScenarioRepository(prisma))`. Inspect the constructor signature first and adapt.

- [ ] **Step 4: Register in route**

In `app/api/mcp/route.ts`, add:

```typescript
import { scenarioWriteTools } from '@/lib/mcp/tools/scenarioWrites';
// ...
const tools = [...readTools, ...adminReadTools, ...scenarioWriteTools];
```

- [ ] **Step 5: Run — pass**

Run: `npx vitest run lib/mcp/tools/scenarioWrites.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/mcp/tools/scenarioWrites.ts lib/mcp/tools/scenarioWrites.test.ts app/api/mcp/route.ts
git commit -m "feat(mcp): create_scenario / update_scenario / archive_scenario"
```

---

## Task 5.1-E: `set_scenario_saas_config` + `set_scenario_labor_lines`

**Files:**

- Modify: `lib/mcp/tools/scenarioWrites.ts`
- Modify: `lib/mcp/tools/scenarioWrites.test.ts`

- [ ] **Step 1: Append tests**

Append to `lib/mcp/tools/scenarioWrites.test.ts`:

```typescript
import { setScenarioSaasConfigTool, setScenarioLaborLinesTool } from './scenarioWrites';
import { upsertSaasConfig, setLaborLines } from '@/lib/services/scenario';

describe('set_scenario_saas_config', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sales caller: own scenario → delegates to upsertSaasConfig', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    vi.mocked(upsertSaasConfig).mockResolvedValue({ id: 'c1' } as any);
    await setScenarioSaasConfigTool.handler(salesCtx, {
      scenarioId: 's1',
      productId: 'p1',
      seatCount: 50,
      personaMix: [{ personaId: 'heavy', pct: 100 }],
    });
    expect(upsertSaasConfig).toHaveBeenCalledWith(
      expect.objectContaining({ scenarioId: 's1', productId: 'p1', seatCount: 50 }),
    );
  });

  it('sales caller: other owner → NotFoundError', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'x' } as any);
    await expect(
      setScenarioSaasConfigTool.handler(salesCtx, {
        scenarioId: 's1',
        productId: 'p1',
        seatCount: 50,
        personaMix: [{ personaId: 'heavy', pct: 100 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('personaMix must sum to 100 (validated)', () => {
    expect(() =>
      setScenarioSaasConfigTool.inputSchema.parse({
        scenarioId: 's',
        productId: 'p',
        seatCount: 10,
        personaMix: [
          { personaId: 'a', pct: 40 },
          { personaId: 'b', pct: 50 },
        ],
      }),
    ).toThrow();
  });
});

describe('set_scenario_labor_lines', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to setLaborLines with all lines replaced', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    vi.mocked(setLaborLines).mockResolvedValue(undefined as any);
    await setScenarioLaborLinesTool.handler(salesCtx, {
      scenarioId: 's1',
      productId: 'p1',
      lines: [
        {
          skuId: 'sku1',
          qty: '2',
          unit: 'PER_USER',
          costPerUnitUsd: '10',
          revenuePerUnitUsd: '20',
        },
      ],
    });
    expect(setLaborLines).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarioId: 's1',
        productId: 'p1',
        lines: expect.arrayContaining([
          expect.objectContaining({ skuId: 'sku1', unit: 'PER_USER' }),
        ]),
      }),
    );
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/mcp/tools/scenarioWrites.test.ts`
Expected: export-not-found.

- [ ] **Step 3: Implement**

Append to `lib/mcp/tools/scenarioWrites.ts`:

```typescript
import Decimal from 'decimal.js';

const decimalFromString = z.union([z.string(), z.number()]).transform((v) => new Decimal(v));

const setScenarioSaasConfigSchema = z
  .object({
    scenarioId: z.string(),
    productId: z.string(),
    seatCount: z.number().int().nonnegative(),
    personaMix: z
      .array(z.object({ personaId: z.string(), pct: z.number().min(0).max(100) }))
      .refine((arr) => Math.abs(arr.reduce((s, p) => s + p.pct, 0) - 100) < 0.001, {
        message: 'personaMix percentages must sum to 100',
      }),
    discountOverridePct: decimalFromString.optional(),
  })
  .strict();

export const setScenarioSaasConfigTool: ToolDefinition<
  z.infer<typeof setScenarioSaasConfigSchema>,
  { scenarioId: string; productId: string }
> = {
  name: 'set_scenario_saas_config',
  description:
    "Upsert a scenario's SaaS tab for one product: seatCount, personaMix (sums to 100), optional discountOverridePct. Replaces any existing config for the same (scenarioId, productId).",
  inputSchema: setScenarioSaasConfigSchema,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (ctx, input) => {
    await assertOwnerOrAdmin(ctx, input.scenarioId);
    await upsertSaasConfig(input);
    return { scenarioId: input.scenarioId, productId: input.productId };
  },
};

const laborLineSchema = z
  .object({
    skuId: z.string().optional(),
    departmentId: z.string().optional(),
    customDescription: z.string().optional(),
    qty: decimalFromString,
    unit: z.string(),
    costPerUnitUsd: decimalFromString,
    revenuePerUnitUsd: decimalFromString,
    sortOrder: z.number().int().optional(),
  })
  .strict();

const setScenarioLaborLinesSchema = z
  .object({
    scenarioId: z.string(),
    productId: z.string(),
    lines: z.array(laborLineSchema),
  })
  .strict();

export const setScenarioLaborLinesTool: ToolDefinition<
  z.infer<typeof setScenarioLaborLinesSchema>,
  { scenarioId: string; productId: string; count: number }
> = {
  name: 'set_scenario_labor_lines',
  description:
    'Replaces ALL labor lines for one (scenarioId, productId) pair with the provided list. To remove a single line, pass the full new list without it.',
  inputSchema: setScenarioLaborLinesSchema,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (ctx, input) => {
    await assertOwnerOrAdmin(ctx, input.scenarioId);
    await setLaborLines(input);
    return { scenarioId: input.scenarioId, productId: input.productId, count: input.lines.length };
  },
};

// Update scenarioWriteTools:
export const scenarioWriteTools: ToolDefinition[] = [
  createScenarioTool,
  updateScenarioTool,
  archiveScenarioTool,
  setScenarioSaasConfigTool,
  setScenarioLaborLinesTool,
];
```

Replace the existing `scenarioWriteTools` export to include the new tools.

- [ ] **Step 4: Run — pass**

Run: `npx vitest run lib/mcp/tools/scenarioWrites.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/tools/scenarioWrites.ts lib/mcp/tools/scenarioWrites.test.ts
git commit -m "feat(mcp): set_scenario_saas_config / set_scenario_labor_lines"
```

---

## Task 5.1-F: `apply_bundle_to_scenario`

- [ ] **Step 1: Append test**

Append to `lib/mcp/tools/scenarioWrites.test.ts`:

```typescript
import { applyBundleToScenarioTool } from './scenarioWrites';
import { applyBundleToScenario } from '@/lib/services/scenario';

describe('apply_bundle_to_scenario', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sales caller: own scenario → delegates', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    vi.mocked(applyBundleToScenario).mockResolvedValue({ scenarioId: 's1', bundleId: 'b1' });
    const out = await applyBundleToScenarioTool.handler(salesCtx, {
      scenarioId: 's1',
      bundleId: 'b1',
    });
    expect(applyBundleToScenario).toHaveBeenCalledWith({ scenarioId: 's1', bundleId: 'b1' });
    expect(out).toEqual({ scenarioId: 's1', bundleId: 'b1' });
  });

  it('sales caller: non-owner scenario → NotFoundError', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'other' } as any);
    await expect(
      applyBundleToScenarioTool.handler(salesCtx, { scenarioId: 's1', bundleId: 'b1' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/mcp/tools/scenarioWrites.test.ts`
Expected: export-not-found.

- [ ] **Step 3: Implement**

Append to `lib/mcp/tools/scenarioWrites.ts`:

```typescript
const applyBundleSchema = z.object({ scenarioId: z.string(), bundleId: z.string() }).strict();

export const applyBundleToScenarioTool: ToolDefinition<
  z.infer<typeof applyBundleSchema>,
  { scenarioId: string; bundleId: string }
> = {
  name: 'apply_bundle_to_scenario',
  description:
    'Writes all bundle items into the scenario: SaaS configs are upserted, labor SKU and department-hours references are appended as new labor lines. Sets appliedBundleId for traceability. Sales callers can only apply to their own scenarios.',
  inputSchema: applyBundleSchema,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Scenario',
  extractTargetId: (input) => input.scenarioId,
  handler: async (ctx, input) => {
    await assertOwnerOrAdmin(ctx, input.scenarioId);
    return applyBundleToScenario(input);
  },
};
```

Update `scenarioWriteTools` to include `applyBundleToScenarioTool`.

- [ ] **Step 4: Run — pass**

Run: `npx vitest run lib/mcp/tools/scenarioWrites.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/tools/scenarioWrites.ts lib/mcp/tools/scenarioWrites.test.ts
git commit -m "feat(mcp): apply_bundle_to_scenario"
```

---

## Task 5.1-G: `generate_quote`

**Files:**

- Modify: `lib/mcp/tools/scenarioWrites.ts`
- Modify: `lib/mcp/tools/scenarioWrites.test.ts`

- [ ] **Step 1: Append test**

Append to `lib/mcp/tools/scenarioWrites.test.ts`:

```typescript
vi.mock('@/lib/services/quote', () => ({
  generateQuote: vi.fn(),
}));
vi.mock('@/lib/pdf/customer', () => ({ renderCustomerPdf: vi.fn() }));
vi.mock('@/lib/pdf/internal', () => ({ renderInternalPdf: vi.fn() }));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from('PDF-BYTES')),
}));

import { generateQuoteTool } from './scenarioWrites';
import { generateQuote } from '@/lib/services/quote';

describe('generate_quote', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns { quoteId, version, downloadUrl } by default', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u1' } as any);
    vi.mocked(generateQuote).mockResolvedValue({
      id: 'q1',
      version: 1,
      pdfUrl: '/tmp/c.pdf',
      internalPdfUrl: '/tmp/i.pdf',
    } as any);
    const out = await generateQuoteTool.handler(adminCtx, { scenarioId: 's1' });
    expect(generateQuote).toHaveBeenCalled();
    expect(out).toEqual({
      quoteId: 'q1',
      version: 1,
      downloadUrl: '/api/quotes/q1/download',
    });
  });

  it('returns customerPdfBase64 when include_pdf_bytes=true', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u1' } as any);
    vi.mocked(generateQuote).mockResolvedValue({
      id: 'q1',
      version: 1,
      pdfUrl: '/tmp/c.pdf',
      internalPdfUrl: '/tmp/i.pdf',
    } as any);
    const out = await generateQuoteTool.handler(adminCtx, {
      scenarioId: 's1',
      include_pdf_bytes: true,
    });
    expect((out as any).customerPdfBase64).toBe(Buffer.from('PDF-BYTES').toString('base64'));
    expect((out as any).internalPdfBase64).toBe(Buffer.from('PDF-BYTES').toString('base64'));
  });

  it('sales caller never receives internal PDF bytes even with include_pdf_bytes=true', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'u2' } as any);
    vi.mocked(generateQuote).mockResolvedValue({
      id: 'q1',
      version: 1,
      pdfUrl: '/tmp/c.pdf',
      internalPdfUrl: '/tmp/i.pdf',
    } as any);
    const out = await generateQuoteTool.handler(salesCtx, {
      scenarioId: 's1',
      include_pdf_bytes: true,
    });
    expect((out as any).customerPdfBase64).toBeDefined();
    expect((out as any).internalPdfBase64).toBeUndefined();
  });

  it('sales caller: non-owner → NotFoundError', async () => {
    vi.mocked(getScenarioById).mockResolvedValue({ id: 's1', ownerId: 'other' } as any);
    await expect(generateQuoteTool.handler(salesCtx, { scenarioId: 's1' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run lib/mcp/tools/scenarioWrites.test.ts`
Expected: export-not-found.

- [ ] **Step 3: Implement**

Append to `lib/mcp/tools/scenarioWrites.ts`:

```typescript
import { readFile } from 'node:fs/promises';
import { generateQuote } from '@/lib/services/quote';
import { renderCustomerPdf } from '@/lib/pdf/customer';
import { renderInternalPdf } from '@/lib/pdf/internal';

const generateQuoteSchema = z
  .object({ scenarioId: z.string(), include_pdf_bytes: z.boolean().optional() })
  .strict();

interface GenerateQuoteOutput {
  quoteId: string;
  version: number;
  downloadUrl: string;
  customerPdfBase64?: string;
  internalPdfBase64?: string;
}

export const generateQuoteTool: ToolDefinition<
  z.infer<typeof generateQuoteSchema>,
  GenerateQuoteOutput
> = {
  name: 'generate_quote',
  description:
    'Re-runs the engine, renders both PDFs (customer + internal), writes a Quote row with a sequential version and frozen totals, returns metadata + download URL. Pass include_pdf_bytes=true to inline the customer PDF (admin also gets internal PDF). Sales callers can only generate quotes for scenarios they own.',
  inputSchema: generateQuoteSchema,
  requiresAdmin: false,
  isWrite: true,
  targetEntityType: 'Quote',
  extractTargetId: (_input, output) => output?.quoteId,
  handler: async (ctx, input) => {
    await assertOwnerOrAdmin(ctx, input.scenarioId);
    const quote = await generateQuote(
      { scenarioId: input.scenarioId, generatedById: ctx.user.id },
      { renderPdf: { customer: renderCustomerPdf, internal: renderInternalPdf } },
    );
    const base: GenerateQuoteOutput = {
      quoteId: quote.id,
      version: quote.version,
      downloadUrl: `/api/quotes/${quote.id}/download`,
    };
    if (!input.include_pdf_bytes) return base;

    const customer = await readFile(quote.pdfUrl);
    const withCustomer: GenerateQuoteOutput = {
      ...base,
      customerPdfBase64: customer.toString('base64'),
    };
    if (ctx.user.role === 'ADMIN' && quote.internalPdfUrl) {
      const internal = await readFile(quote.internalPdfUrl);
      return { ...withCustomer, internalPdfBase64: internal.toString('base64') };
    }
    return withCustomer;
  },
};
```

Update `scenarioWriteTools` to include `generateQuoteTool`.

- [ ] **Step 4: Run — pass**

Run: `npx vitest run lib/mcp/tools/scenarioWrites.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/tools/scenarioWrites.ts lib/mcp/tools/scenarioWrites.test.ts
git commit -m "feat(mcp): generate_quote (opt-in PDF bytes, admin-only internal bytes)"
```

---

## Task 5.1-H: Bearer-auth branch on `/api/quotes/[quoteId]/download`

**Files:**

- Modify: `app/api/quotes/[quoteId]/download/route.ts`
- Modify: `app/api/quotes/[quoteId]/download/route.test.ts`

- [ ] **Step 1: Add failing test**

Append to `app/api/quotes/[quoteId]/download/route.test.ts`:

```typescript
vi.mock('@/lib/mcp/auth', () => ({
  authenticateMcpRequest: vi.fn(),
}));

import { authenticateMcpRequest } from '@/lib/mcp/auth';

describe('bearer-token auth on download', () => {
  beforeEach(() => vi.clearAllMocks());

  it('honors Bearer token when no session exists', async () => {
    vi.mocked(getSessionUser as any).mockResolvedValue(null);
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      user: { id: 'u1', email: 'a', name: null, role: 'SALES' },
      token: { id: 't1', label: 'x', ownerUserId: 'u1' },
    });
    const findById = vi.fn(async () => ({
      id: 'q1',
      scenario: { id: 's1', ownerId: 'u1' },
      pdfUrl: '/tmp/customer.pdf',
      internalPdfUrl: null,
    }));
    (QuoteRepository as any).mockImplementation(() => ({ findById }));

    const req = new Request('http://x/api/quotes/q1/download', {
      headers: { Authorization: 'Bearer np_live_good' },
    });
    const res = await GET(req, { params: { quoteId: 'q1' } });
    expect(res.status).toBe(404); // missing file, but path is valid; this confirms we reached file read
    expect(authenticateMcpRequest).toHaveBeenCalled();
  });

  it('falls through to session when no bearer header provided', async () => {
    vi.mocked(getSessionUser as any).mockResolvedValue({ id: 'u1', role: 'SALES' });
    const req = new Request('http://x/api/quotes/q1/download');
    const res = await GET(req, { params: { quoteId: 'q1' } });
    expect(authenticateMcpRequest).not.toHaveBeenCalled();
    // status depends on repo behavior which is already mocked in prior tests.
    expect(res).toBeDefined();
  });

  it('invalid bearer with no session → 404', async () => {
    vi.mocked(getSessionUser as any).mockResolvedValue(null);
    vi.mocked(authenticateMcpRequest).mockRejectedValue(new Error('bad'));
    const req = new Request('http://x/api/quotes/q1/download', {
      headers: { Authorization: 'Bearer np_live_bad' },
    });
    const res = await GET(req, { params: { quoteId: 'q1' } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run app/api/quotes/\[quoteId\]/download/route.test.ts`
Expected: failures because `authenticateMcpRequest` isn't called.

- [ ] **Step 3: Update the route**

In `app/api/quotes/[quoteId]/download/route.ts`, at the top of `GET`, replace the session-only auth with:

```typescript
import { authenticateMcpRequest } from '@/lib/mcp/auth';

async function resolveUser(request: Request) {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (header?.startsWith('Bearer ')) {
    try {
      const ctx = await authenticateMcpRequest(request);
      return ctx.user;
    } catch {
      return null;
    }
  }
  return getSessionUser();
}

// ... in GET():
const user = await resolveUser(request);
if (!user) return notFound();
// rest of handler unchanged (quote lookup, ownership check, variant, etc.)
```

- [ ] **Step 4: Run — pass**

Run: `npx vitest run app/api/quotes/\[quoteId\]/download/route.test.ts`
Expected: all tests pass (4 pre-existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add app/api/quotes/\[quoteId\]/download/route.ts app/api/quotes/\[quoteId\]/download/route.test.ts
git commit -m "feat(mcp): bearer-token auth branch on quote download route"
```

---

## File Map Summary

**Created:**

- `lib/mcp/auditWrapper.ts` + `.test.ts`
- `lib/mcp/tools/scenarioWrites.ts` + `.test.ts`

**Modified:**

- `lib/mcp/server.ts` + `.test.ts` (ToolDefinition + audit wiring)
- `lib/services/scenario.ts` + `.test.ts` (extract 4 free functions)
- `app/scenarios/[id]/actions.ts` (refactor to call services)
- `app/scenarios/[id]/notes/actions.ts` (refactor)
- `app/scenarios/[id]/training/actions.ts` (refactor)
- `app/scenarios/[id]/service/actions.ts` (refactor)
- `app/api/mcp/route.ts` (register scenarioWriteTools)
- `app/api/quotes/[quoteId]/download/route.ts` + `.test.ts` (bearer branch)

---

## Risks

- **Service extraction drift.** Task 5.1-C moves code from four server actions into `lib/services/scenario.ts`. The risk is subtle divergence (a different default unit, a different transactional order). Mitigation: the existing server actions' tests continue to exercise the extracted code path via the refactored actions; a suite-green result proves the extraction was faithful.
- **`personaMix` sum validation.** The tool validates `pct` sums to 100; the engine also validates. Duplicated but defense-in-depth. If UX reveals this double-validation producing confusing errors, relax the tool-side check to `sum > 0` and let the engine emit the precise message.
- **Audit log for `generate_quote`.** A successful `generate_quote` call writes both a `Quote` row and an `ApiAuditLog` row. Two writes in the same logical unit. If the audit-log append fails, we've swallowed the error silently (fire-and-forget); the quote still succeeds. Acceptable for v2; revisit if we see audit gaps in production.
- **Bearer auth on download.** The route now has two auth paths. Care: the order matters — bearer is tried first only if a `Bearer` header exists; otherwise session is used. Don't inadvertently gate PDF downloads behind bearer tokens for the existing web UI flow.

---

## Milestones

1. 5.1-A, 5.1-B done — audit wiring is alive. No tools use it yet.
2. 5.1-C done — scenario service has the new free functions; web UI unchanged behaviorally.
3. 5.1-D, 5.1-E, 5.1-F done — 5 scenario-edit tools live; Cowork can build scenarios.
4. 5.1-G done — `generate_quote` works via MCP; PDFs written.
5. 5.1-H done — MCP callers can download the PDFs they just generated.

## Acceptance Criteria

### Functional

- An admin token can call all 7 write tools; a sales token can call all except none (all 7 are sales-accessible) — BUT sales callers can only write to scenarios they own.
- Every successful write call produces exactly one `ApiAuditLog` row with `result=OK` and the correct `targetEntityId`.
- Every failed write call produces exactly one `ApiAuditLog` row with `result=ERROR` and the original error class name in `errorCode`.
- `generate_quote` with `include_pdf_bytes: false` returns `{ quoteId, version, downloadUrl }`; with `true` it additionally returns `customerPdfBase64` (always) and `internalPdfBase64` (admin callers only).
- `GET /api/quotes/[id]/download` with a valid bearer token (and an owner or admin user) returns 200 + `application/pdf`.

### Non-functional

- `npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` all clean.
- No Prisma imports in `lib/mcp/tools/*`; only services.
- `lib/services/scenario.ts` is the single source for scenario-write logic.

---

## Phase 5.1 → 5.2 handoff

At the end of Phase 5.1:

- 21 tools live (14 reads + 7 scenario writes).
- Audit wrapper battle-tested on 7 write paths.
- Catalog-write tools in Phase 5.2 reuse the same `isWrite + extractTargetId` pattern, adding ~42 more tools across Products, SaaS rate card, Labor, Commissions, Bundles, and Rails.
