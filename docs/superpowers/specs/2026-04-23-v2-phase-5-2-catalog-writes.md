# Ninja Pricer v2 — Phase 5.2: Catalog Writes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 42 admin-only MCP write tools spanning the full product catalog — product shell, SaaS rate card, labor (SKUs/departments/employees/burdens), commissions, bundles, rails — completing MCP tool parity with the admin UI (user management intentionally excluded per the design spec).

**Architecture:** Six new tool files under `lib/mcp/tools/catalog/`, one per domain. Each tool is a thin Zod-validated wrapper over an existing `lib/services/*` service method. All tools use `requiresAdmin: true` + `isWrite: true` + `targetEntityType` + `extractTargetId`, so the audit wrapper from Phase 5.1 logs every call automatically. Pattern identical to Phase 5.1's `scenarioWrites.ts`.

**Tech Stack:** Inherited from Phases 5.0–5.1 — TypeScript strict, Next.js 14, Prisma, Zod, `@modelcontextprotocol/sdk`, Vitest.

**Design spec:** [docs/superpowers/specs/2026-04-21-v2-mcp-server-design.md](./2026-04-21-v2-mcp-server-design.md)
**Phase 5.1 plan:** [docs/superpowers/specs/2026-04-22-v2-phase-5-1-scenario-writes.md](./2026-04-22-v2-phase-5-1-scenario-writes.md)

---

## Conventions (inherited)

- **TDD.** Failing test → run → implement → pass → commit.
- **One commit per sub-task** (i.e. per domain in this phase). Each domain sub-task may add multiple tools in the same commit — they share a file and the pattern is uniform.
- Constructor-injected `PrismaClient` for all repositories; services expose methods that take Zod-parseable inputs.
- Tools never import Prisma.
- Zod at the tool boundary; services defensively re-validate.
- Typed errors → MCP error codes via `lib/mcp/errors.ts`.
- **Conventional commits.**

## Goals

- Every admin CRUD operation exposed in the web UI — except user management — is callable via MCP.
- Every tool is admin-gated at the server (sales tokens receive `-32002 Forbidden`, and `tools/list` hides these tools from sales callers).
- Every successful call produces an `ApiAuditLog` `OK` row; every failure produces an `ERROR` row with the error class name — handled by the existing audit wrapper.
- `set_*` tools that manage a collection (`set_volume_tiers`, `set_contract_modifiers`, `set_commission_tiers`, `set_bundle_items`, `set_base_usage`) replace the entire set in one call.

## Non-Goals

- User management tools (`invite_user`, `set_user_role`, `delete_user`) — web-UI only.
- New UI work. This phase is server-only; the admin UI already covers these operations.
- Changes to `lib/services/*` behavior. If a service lacks a required method, add a thin wrapper; do NOT alter existing logic.
- Idempotency keys, rate limiting — out of scope for v2.

---

## Shared Pattern

Every tool in this phase follows the identical shape. This is the single source of truth; subsequent per-domain tasks only need to specify the Zod schema, the service call, and the `extractTargetId` function.

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { <ServiceClass> } from '@/lib/services/<domain>';

const <toolName>Schema = z.object({ /* shape */ }).strict();

export const <toolName>Tool: ToolDefinition<
  z.infer<typeof <toolName>Schema>,
  { id: string }
> = {
  name: '<tool_name>',
  description:
    'Admin only. <one-sentence purpose>. <Side-effect note>. <Non-obvious failure mode.>',
  inputSchema: <toolName>Schema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: '<EntityName>',
  extractTargetId: (input, output) => output?.id ?? (input as { id?: string }).id,
  handler: async (_ctx, input) => {
    const svc = new <ServiceClass>(prisma);
    const row = await svc.<method>(input);
    return { id: row.id };
  },
};
```

**Rules for the pattern:**

- `requiresAdmin: true` AND `isWrite: true` on every tool in this phase.
- `extractTargetId` prefers the output id (so `create_*` tools log the new id); falls back to the input id (so `update_*` and `delete_*` log the existing id).
- `set_*` collection-replace tools use `extractTargetId: (input) => (input as { productId: string }).productId` (or whichever owning entity the collection belongs to) — the collection itself has no single id.
- Descriptions start with `Admin only.` — makes role requirements obvious in `tools/list` and in help.
- If a service method requires a `PrismaClient` constructor arg, pass `prisma` from `@/lib/db/client`. If the service has free-function helpers already (like `listEmployees`), call those directly.

## Tool-registration

Each domain file exports a `<domain>Tools: ToolDefinition[]` array at the bottom. The final task (5.2-G) updates `app/api/mcp/route.ts` to spread all six arrays into the `tools` list.

---

## Task 5.2-A: Product shell — 3 tools (WORKED EXAMPLE)

Tools: `create_product`, `update_product`, `delete_product`.

**Files:**
- Create: `lib/mcp/tools/catalog/product.ts`
- Create: `lib/mcp/tools/catalog/product.test.ts`
- Modify: `app/api/mcp/route.ts`

Full worked example — subsequent tasks replicate this structure.

- [ ] **Step 1: Inspect the service**

Open `lib/services/product.ts`. Confirm the class has `createProduct(data)`, `updateProduct(id, data)`, and either `deleteProduct(id)` or a method that archives rather than hard-deletes. If `deleteProduct` doesn't exist, add it as a thin repository wrapper in the same commit (delete via `prisma.product.delete({ where: { id } })`, which will cascade per the Prisma schema; fail if any scenario references the product via the onDelete: Restrict relation).

- [ ] **Step 2: Write the failing tests**

Create `lib/mcp/tools/catalog/product.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/db/client', () => ({ prisma: {} }));
vi.mock('@/lib/services/product', () => ({
  ProductService: vi.fn(function (this: any) {
    this.createProduct = vi.fn();
    this.updateProduct = vi.fn();
    this.deleteProduct = vi.fn();
    return this;
  }),
}));

import { ProductService } from '@/lib/services/product';
import { createProductTool, updateProductTool, deleteProductTool } from './product';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};

describe('product catalog tools', () => {
  let svc: any;
  beforeEach(() => {
    vi.clearAllMocks();
    svc = new (ProductService as any)();
    (ProductService as any).mockImplementation(function (this: any) {
      Object.assign(this, svc);
      return this;
    });
  });

  it('all are admin + isWrite', () => {
    for (const tool of [createProductTool, updateProductTool, deleteProductTool]) {
      expect(tool.requiresAdmin).toBe(true);
      expect(tool.isWrite).toBe(true);
      expect(tool.targetEntityType).toBe('Product');
    }
  });

  describe('create_product', () => {
    it('creates with name + kind, returns {id}', async () => {
      svc.createProduct.mockResolvedValue({ id: 'p1' });
      const out = await createProductTool.handler(adminCtx, {
        name: 'Ninja Notes',
        kind: 'SAAS_USAGE',
      });
      expect(svc.createProduct).toHaveBeenCalledWith({
        name: 'Ninja Notes',
        kind: 'SAAS_USAGE',
      });
      expect(out).toEqual({ id: 'p1' });
    });

    it('rejects invalid kind', () => {
      expect(() =>
        createProductTool.inputSchema.parse({ name: 'X', kind: 'INVALID' }),
      ).toThrow();
    });
  });

  describe('update_product', () => {
    it('accepts patch fields', async () => {
      svc.updateProduct.mockResolvedValue({ id: 'p1' });
      await updateProductTool.handler(adminCtx, {
        id: 'p1',
        name: 'Renamed',
        isArchived: true,
      });
      expect(svc.updateProduct).toHaveBeenCalledWith('p1', {
        name: 'Renamed',
        isArchived: true,
      });
    });

    it('rejects empty patch', () => {
      expect(() => updateProductTool.inputSchema.parse({ id: 'p1' })).toThrow();
    });
  });

  describe('delete_product', () => {
    it('calls service.deleteProduct', async () => {
      svc.deleteProduct.mockResolvedValue({ id: 'p1' });
      await deleteProductTool.handler(adminCtx, { id: 'p1' });
      expect(svc.deleteProduct).toHaveBeenCalledWith('p1');
    });
  });
});
```

- [ ] **Step 3: Run — fail**

Run: `npx vitest run lib/mcp/tools/catalog/product.test.ts`
Expected: `Cannot find module './product'`.

- [ ] **Step 4: Implement**

Create `lib/mcp/tools/catalog/product.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '@/lib/mcp/server';
import { prisma } from '@/lib/db/client';
import { ProductService } from '@/lib/services/product';

const productKindEnum = z.enum(['SAAS_USAGE', 'PACKAGED_LABOR', 'CUSTOM_LABOR']);

const createProductSchema = z
  .object({
    name: z.string().min(1),
    kind: productKindEnum,
  })
  .strict();

export const createProductTool: ToolDefinition<
  z.infer<typeof createProductSchema>,
  { id: string }
> = {
  name: 'create_product',
  description:
    'Admin only. Creates a new product shell (name + kind: SAAS_USAGE | PACKAGED_LABOR | CUSTOM_LABOR). Rate cards, personas, etc. are added via subsequent tools.',
  inputSchema: createProductSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Product',
  extractTargetId: (_input, output) => output?.id,
  handler: async (_ctx, input) => {
    const svc = new ProductService(prisma);
    const row = await svc.createProduct(input);
    return { id: row.id };
  },
};

const updateProductSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1).optional(),
    isArchived: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.isArchived !== undefined, {
    message: 'at least one of name or isArchived is required',
  });

export const updateProductTool: ToolDefinition<
  z.infer<typeof updateProductSchema>,
  { id: string }
> = {
  name: 'update_product',
  description:
    'Admin only. Patch product shell fields (name, isArchived). Reversible. Use isArchived=true to hide a product from sales without deleting.',
  inputSchema: updateProductSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Product',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id, ...patch }) => {
    const svc = new ProductService(prisma);
    await svc.updateProduct(id, patch);
    return { id };
  },
};

const deleteProductSchema = z.object({ id: z.string() }).strict();

export const deleteProductTool: ToolDefinition<
  z.infer<typeof deleteProductSchema>,
  { id: string }
> = {
  name: 'delete_product',
  description:
    'Admin only. Hard-deletes a product and cascades its rate card, personas, etc. FAILS if any scenario references the product (Prisma onDelete: Restrict). Prefer update_product { isArchived: true } unless you are certain.',
  inputSchema: deleteProductSchema,
  requiresAdmin: true,
  isWrite: true,
  targetEntityType: 'Product',
  extractTargetId: (input) => input.id,
  handler: async (_ctx, { id }) => {
    const svc = new ProductService(prisma);
    await svc.deleteProduct(id);
    return { id };
  },
};

export const productCatalogTools: ToolDefinition[] = [
  createProductTool,
  updateProductTool,
  deleteProductTool,
];
```

- [ ] **Step 5: Register in route**

Edit `app/api/mcp/route.ts`:

```typescript
import { productCatalogTools } from '@/lib/mcp/tools/catalog/product';
// ...
const tools = [
  ...readTools,
  ...adminReadTools,
  ...scenarioWriteTools,
  ...productCatalogTools,
];
```

- [ ] **Step 6: Run — pass**

Run: `npx vitest run lib/mcp/tools/catalog/product.test.ts`
Expected: all tests pass.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add lib/mcp/tools/catalog/product.ts lib/mcp/tools/catalog/product.test.ts app/api/mcp/route.ts lib/services/product.ts
git commit -m "feat(mcp): product shell tools (create/update/delete_product)"
```

---

## Task 5.2-B: SaaS rate card — 15 tools

Apply the pattern from 5.2-A.

**File:** `lib/mcp/tools/catalog/saasRateCard.ts` + `.test.ts`. Commit: `feat(mcp): SaaS rate-card tools (vendor rates, personas, list price, tiers)`.

### Tools

| # | Tool | Service call | Input shape | targetEntityType | targetId |
|---|---|---|---|---|---|
| 1 | `create_vendor_rate` | `VendorRateService.upsert({productId, name, unitLabel, rateUsd})` | `{productId, name, unitLabel, rateUsd:string\|number}` | `VendorRate` | `output.id` |
| 2 | `update_vendor_rate` | `VendorRateService.upsert({id, productId, ...})` | `{id, name?, unitLabel?, rateUsd?}` | `VendorRate` | `input.id` |
| 3 | `delete_vendor_rate` | `VendorRateService.delete(id)` | `{id}` | `VendorRate` | `input.id` |
| 4 | `set_base_usage` | `BaseUsageService.setForProduct(productId, entries)` | `{productId, entries:[{vendorRateId, usagePerMonth}]}` | `Product` | `input.productId` |
| 5 | `set_other_variable` | `OtherVariableService.setForProduct(productId, usdPerUserPerMonth)` | `{productId, usdPerUserPerMonth:string\|number}` | `Product` | `input.productId` |
| 6 | `create_persona` | `PersonaService.create({productId, name, multiplier, sortOrder?})` | `{productId, name, multiplier:string\|number, sortOrder?}` | `Persona` | `output.id` |
| 7 | `update_persona` | `PersonaService.update(id, patch)` | `{id, name?, multiplier?, sortOrder?}` | `Persona` | `input.id` |
| 8 | `delete_persona` | `PersonaService.delete(id)` | `{id}` | `Persona` | `input.id` |
| 9 | `create_fixed_cost` | `ProductFixedCostService.create({productId, name, monthlyUsd})` | `{productId, name, monthlyUsd:string\|number}` | `ProductFixedCost` | `output.id` |
| 10 | `update_fixed_cost` | `ProductFixedCostService.update(id, patch)` | `{id, name?, monthlyUsd?}` | `ProductFixedCost` | `input.id` |
| 11 | `delete_fixed_cost` | `ProductFixedCostService.delete(id)` | `{id}` | `ProductFixedCost` | `input.id` |
| 12 | `set_product_scale` | `ProductScaleService.setForProduct(productId, activeUsersAtScale)` | `{productId, activeUsersAtScale:int}` | `Product` | `input.productId` |
| 13 | `set_list_price` | `ListPriceService.setForProduct(productId, usdPerSeatPerMonth)` | `{productId, usdPerSeatPerMonth:string\|number}` | `Product` | `input.productId` |
| 14 | `set_volume_tiers` | `VolumeDiscountTierService.setForProduct(productId, tiers)` | `{productId, tiers:[{minSeats:int, discountPct:string\|number}]}` — REPLACES | `Product` | `input.productId` |
| 15 | `set_contract_modifiers` | `ContractLengthModifierService.setForProduct(productId, modifiers)` | `{productId, modifiers:[{minMonths:int, additionalDiscountPct:string\|number}]}` — REPLACES | `Product` | `input.productId` |

### Tests

One `describe` block per tool. Each block: `requiresAdmin + isWrite + targetEntityType` shape check, plus one happy-path handler test asserting the correct service method is called with the right args.

For tools 14 and 15 (collection-replace), add an extra test asserting the service receives the full tiers/modifiers array so replacement semantics are locked in.

### Execution steps

- [ ] **Step 1:** For each service method listed above, inspect its signature in `lib/services/*.ts`. If any method doesn't exist as listed (e.g., the service uses `upsert(data)` instead of separate `create`/`update`/`delete`), use whatever method DOES exist and adapt:
  - If the service has `upsert(data)` only, then `create_*` calls `upsert({...})` without `id`, and `update_*` calls `upsert({id, ...})`.
  - If a `delete(id)` method doesn't exist, add one: `async delete(id: string) { return this.repo.delete(id); }` — where `this.repo.delete` wraps Prisma's `delete({ where: { id } })`. Add it in the same commit.
  - If a `setForProduct(productId, ...)` method doesn't exist on a service that has per-record CRUD, add it as a free function: `deleteMany + createMany in a transaction`, following the shape in `lib/services/scenario.ts`'s `setLaborLines`.

- [ ] **Step 2:** Write tests following the shape from 5.2-A (product.test.ts). ~45 tests across the 15 tools (3 each).

- [ ] **Step 3:** Run — fail.

- [ ] **Step 4:** Implement `lib/mcp/tools/catalog/saasRateCard.ts` with all 15 tools, following the 5.2-A pattern. Export `saasRateCardTools: ToolDefinition[]` at the bottom.

- [ ] **Step 5:** Register in `app/api/mcp/route.ts`: add `...saasRateCardTools` to the `tools` array.

- [ ] **Step 6:** Run tests, typecheck, verify green.

- [ ] **Step 7:** Commit: `feat(mcp): SaaS rate-card tools (vendor rates, personas, list price, tiers)`

---

## Task 5.2-C: Labor — 13 tools

**File:** `lib/mcp/tools/catalog/labor.ts` + `.test.ts`. Commit: `feat(mcp): labor tools (SKUs, departments, employees, burdens)`.

### Tools

| # | Tool | Service call | Input shape | targetEntityType | targetId |
|---|---|---|---|---|---|
| 1 | `create_labor_sku` | `LaborSKUService.create({productId, name, unit, costPerUnitUsd, defaultRevenueUsd})` | `{productId, name, unit:PER_USER\|PER_SESSION\|PER_DAY\|FIXED, costPerUnitUsd:string\|number, defaultRevenueUsd:string\|number}` | `LaborSKU` | `output.id` |
| 2 | `update_labor_sku` | `LaborSKUService.update(id, patch)` | `{id, name?, unit?, costPerUnitUsd?, defaultRevenueUsd?}` | `LaborSKU` | `input.id` |
| 3 | `delete_labor_sku` | `LaborSKUService.delete(id)` | `{id}` | `LaborSKU` | `input.id` |
| 4 | `create_department` | `DepartmentService.create({name})` | `{name}` | `Department` | `output.id` |
| 5 | `update_department` | `DepartmentService.update(id, patch)` | `{id, name?}` | `Department` | `input.id` |
| 6 | `delete_department` | `DepartmentService.delete(id)` | `{id}` | `Department` | `input.id` |
| 7 | `set_department_bill_rate` | `DepartmentService.setBillRate(departmentId, billRatePerHour)` | `{departmentId, billRatePerHour:string\|number}` | `Department` | `input.departmentId` |
| 8 | `create_employee` | `EmployeeService.create({name, departmentId, compensationType, annualSalaryUsd?, hourlyRateUsd?, standardHoursPerYear?, isActive?})` | matching service shape | `Employee` | `output.id` |
| 9 | `update_employee` | `EmployeeService.update(id, patch)` | `{id, ...patch}` | `Employee` | `input.id` |
| 10 | `delete_employee` | `EmployeeService.delete(id)` | `{id}` | `Employee` | `input.id` |
| 11 | `create_burden` | `BurdenService.create({name, ratePct:string\|number, capUsd?:string\|number, scope:ALL_DEPARTMENTS\|DEPARTMENT, departmentId?, isActive?})` | matching | `Burden` | `output.id` |
| 12 | `update_burden` | `BurdenService.update(id, patch)` | `{id, ...patch}` | `Burden` | `input.id` |
| 13 | `delete_burden` | `BurdenService.delete(id)` | `{id}` | `Burden` | `input.id` |

### Execution

Same 7 steps as 5.2-B.

Service method gaps: if `DepartmentService.setBillRate(id, rate)` doesn't exist, add it — wraps upsert of the `DepartmentBillRate` row: `prisma.departmentBillRate.upsert({ where: { departmentId }, create: { departmentId, billRatePerHour }, update: { billRatePerHour } })`.

~39 tests expected.

---

## Task 5.2-D: Commissions — 4 tools

**File:** `lib/mcp/tools/catalog/commissions.ts` + `.test.ts`. Commit: `feat(mcp): commission tools (rules + tier replace)`.

### Tools

| # | Tool | Service call | Input shape | targetEntityType | targetId |
|---|---|---|---|---|---|
| 1 | `create_commission_rule` | `CommissionRuleService.create({name, scopeType, scopeProductId?, scopeDepartmentId?, baseMetric, recipientEmployeeId?, isActive?})` | per service | `CommissionRule` | `output.id` |
| 2 | `update_commission_rule` | `CommissionRuleService.update(id, patch)` | `{id, ...patch}` | `CommissionRule` | `input.id` |
| 3 | `delete_commission_rule` | `CommissionRuleService.delete(id)` | `{id}` | `CommissionRule` | `input.id` |
| 4 | `set_commission_tiers` | `CommissionTierService.setForRule(ruleId, tiers)` | `{ruleId, tiers:[{thresholdFromUsd:string\|number, ratePct:string\|number, sortOrder?:int}]}` — REPLACES | `CommissionRule` | `input.ruleId` |

### Execution

Same 7 steps. Tool #4 is collection-replace; test explicitly that the service receives the full tier array.

Service method gap: if `CommissionTierService.setForRule(ruleId, tiers)` doesn't exist, add it as `deleteMany({ commissionRuleId: ruleId }) + createMany` in a transaction.

Input validation: `thresholdFromUsd` values must be non-decreasing across the tier array. Validate at the Zod boundary with `.refine`:

```typescript
.refine((tiers) => {
  for (let i = 1; i < tiers.length; i++) {
    if (Number(tiers[i].thresholdFromUsd) < Number(tiers[i - 1].thresholdFromUsd)) return false;
  }
  return true;
}, { message: 'tier thresholds must be non-decreasing' })
```

~12 tests.

---

## Task 5.2-E: Bundles — 4 tools

**File:** `lib/mcp/tools/catalog/bundles.ts` + `.test.ts`. Commit: `feat(mcp): bundle tools (create/update/delete + item replace)`.

### Tools

| # | Tool | Service call | Input shape | targetEntityType | targetId |
|---|---|---|---|---|---|
| 1 | `create_bundle` | `BundleService.create({name, description?, isActive?})` | per service | `Bundle` | `output.id` |
| 2 | `update_bundle` | `BundleService.update(id, patch)` | `{id, name?, description?, isActive?}` | `Bundle` | `input.id` |
| 3 | `delete_bundle` | `BundleService.delete(id)` | `{id}` | `Bundle` | `input.id` |
| 4 | `set_bundle_items` | `BundleItemService.setForBundle(bundleId, items)` | `{bundleId, items:[{kind:SAAS_CONFIG\|LABOR_SKU\|DEPARTMENT_HOURS, saasConfig?, laborRef?, sortOrder?:int}]}` — REPLACES | `Bundle` | `input.bundleId` |

### Execution

Same 7 steps. Item shape for `set_bundle_items` is discriminated-union style:

```typescript
const itemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('SAAS_CONFIG'), saasConfig: z.object({
    productId: z.string(),
    seatCount: z.number().int().nonnegative(),
    personaMix: z.array(z.object({ personaId: z.string(), pct: z.number() })),
    discountOverridePct: z.union([z.string(), z.number()]).optional(),
  }), sortOrder: z.number().int().optional() }),
  z.object({ kind: z.literal('LABOR_SKU'), laborRef: z.object({
    productId: z.string(),
    skuId: z.string(),
    qty: z.number(),
  }), sortOrder: z.number().int().optional() }),
  z.object({ kind: z.literal('DEPARTMENT_HOURS'), laborRef: z.object({
    productId: z.string(),
    departmentId: z.string(),
    hours: z.number(),
  }), sortOrder: z.number().int().optional() }),
]);
```

Service gap: if `BundleItemService.setForBundle(bundleId, items)` doesn't exist, add it — `deleteMany + createMany` in a transaction. Match the JSON column shapes used by existing `applyBundleAction`.

~12 tests.

---

## Task 5.2-F: Rails — 3 tools

**File:** `lib/mcp/tools/catalog/rails.ts` + `.test.ts`. Commit: `feat(mcp): rail tools (create/update/delete)`.

### Tools

| # | Tool | Service call | Input shape | targetEntityType | targetId |
|---|---|---|---|---|---|
| 1 | `create_rail` | `RailService.upsert({productId, kind, marginBasis, softThreshold, hardThreshold, isEnabled?})` | `{productId, kind:MIN_MARGIN_PCT\|MAX_DISCOUNT_PCT\|MIN_SEAT_PRICE\|MIN_CONTRACT_MONTHS, marginBasis:CONTRIBUTION\|NET, softThreshold:string\|number, hardThreshold:string\|number, isEnabled?:bool}` | `Rail` | `output.id` |
| 2 | `update_rail` | `RailService.upsert({id, ...patch})` | `{id, kind?, marginBasis?, softThreshold?, hardThreshold?, isEnabled?}` | `Rail` | `input.id` |
| 3 | `delete_rail` | `RailService.delete(id)` | `{id}` | `Rail` | `input.id` |

### Execution

Same 7 steps. If `RailService.delete(id)` doesn't exist, add it. `RailService` already exposes `upsert` per the Phase 5.0 inspection.

Input validation: for `MIN_MARGIN_PCT` and `MAX_DISCOUNT_PCT`, thresholds are fractions (0..1). For `MIN_SEAT_PRICE` (cents) and `MIN_CONTRACT_MONTHS` (months), thresholds are non-negative numbers. Don't Zod-enforce these semantics — the engine and service already validate; tools just pass through.

~9 tests.

---

## Task 5.2-G: Final integration test

**Files:** `app/api/mcp/protocol.test.ts` — extend existing protocol conformance test.

- [ ] **Step 1: Add tests**

Append to `app/api/mcp/protocol.test.ts`:

```typescript
describe('Phase 5.2 catalog tools protocol conformance', () => {
  it('admin sees all 42 catalog-write tools in tools/list', async () => {
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      user: { id: 'u1', email: 'a', name: null, role: 'ADMIN' },
      token: { id: 't1', label: 'x', ownerUserId: 'u1' },
    });
    const res = await POST(rpc(100, 'tools/list'));
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    const expected = [
      'create_product', 'update_product', 'delete_product',
      'create_vendor_rate', 'update_vendor_rate', 'delete_vendor_rate',
      'set_base_usage', 'set_other_variable',
      'create_persona', 'update_persona', 'delete_persona',
      'create_fixed_cost', 'update_fixed_cost', 'delete_fixed_cost',
      'set_product_scale', 'set_list_price',
      'set_volume_tiers', 'set_contract_modifiers',
      'create_labor_sku', 'update_labor_sku', 'delete_labor_sku',
      'create_department', 'update_department', 'delete_department',
      'set_department_bill_rate',
      'create_employee', 'update_employee', 'delete_employee',
      'create_burden', 'update_burden', 'delete_burden',
      'create_commission_rule', 'update_commission_rule', 'delete_commission_rule',
      'set_commission_tiers',
      'create_bundle', 'update_bundle', 'delete_bundle', 'set_bundle_items',
      'create_rail', 'update_rail', 'delete_rail',
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it('sales sees NONE of the catalog-write tools', async () => {
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      user: { id: 'u2', email: 's', name: null, role: 'SALES' },
      token: { id: 't2', label: 'y', ownerUserId: 'u2' },
    });
    const res = await POST(rpc(101, 'tools/list'));
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    const forbidden = ['create_product', 'set_commission_tiers', 'delete_employee'];
    for (const name of forbidden) {
      expect(names).not.toContain(name);
    }
  });

  it('sales calling a catalog tool gets -32002 Forbidden', async () => {
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      user: { id: 'u2', email: 's', name: null, role: 'SALES' },
      token: { id: 't2', label: 'y', ownerUserId: 'u2' },
    });
    const res = await POST(
      rpc(102, 'tools/call', { name: 'create_product', arguments: { name: 'X', kind: 'SAAS_USAGE' } }),
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32002);
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run app/api/mcp/protocol.test.ts`
Expected: all 4 prior + 3 new tests pass.

- [ ] **Step 3: Final verification**

Run: `npm run test && npm run lint && npm run build && npx tsc --noEmit`
Expected: everything green.

- [ ] **Step 4: Commit**

```bash
git add app/api/mcp/protocol.test.ts
git commit -m "test(mcp): protocol conformance for catalog-write tools"
```

---

## File Map Summary

**Created:**
- `lib/mcp/tools/catalog/product.ts` + `.test.ts`
- `lib/mcp/tools/catalog/saasRateCard.ts` + `.test.ts`
- `lib/mcp/tools/catalog/labor.ts` + `.test.ts`
- `lib/mcp/tools/catalog/commissions.ts` + `.test.ts`
- `lib/mcp/tools/catalog/bundles.ts` + `.test.ts`
- `lib/mcp/tools/catalog/rails.ts` + `.test.ts`

**Modified:**
- `app/api/mcp/route.ts` — spread all 6 new tool arrays into `tools`.
- `app/api/mcp/protocol.test.ts` — catalog-tool conformance tests.
- Various `lib/services/*.ts` — thin methods added where missing (delete methods, setFor-style collection-replace helpers). No behavior changes to existing methods.

**Expected new tests:** ~120 (across the 6 domain files).

---

## Risks

- **Service-method shape drift.** Services were built in Phase 2 before MCP was a concern. Some might take `data: unknown` and Zod-parse internally; others have typed signatures. Tools should pass pre-parsed objects; if a service requires further parsing, that's fine — the double-validation is defense-in-depth.
- **`delete_*` cascades.** Many catalog entities have `onDelete: Restrict` relations to Scenario. Deleting a product with active scenarios will throw a Prisma error; the audit wrapper will log `ERROR` with `errorCode: PrismaClientKnownRequestError`. Documented in the tool description. Not a bug.
- **`set_*` collection-replace.** If the `deleteMany` + `createMany` transaction fails mid-way, Prisma's transaction semantics roll it back. No half-applied state. If the tests for `set_bundle_items` flake on race conditions, use `prisma.$transaction(async (tx) => {...})` explicitly rather than the array form.
- **Tool name collisions.** Zod-infer types are per-file; no cross-file TypeScript collision risk. Tool-name collisions would manifest at `createMcpServer` startup — the constructor uses `new Map(tools.map(t => [t.name, t]))` which silently last-wins. Add a dev assertion in a follow-up if tool-name collisions become a concern.

---

## Milestones

1. **5.2-A done** — product shell tools live; worked pattern proven.
2. **5.2-B done** — 15 SaaS rate-card tools live.
3. **5.2-C done** — 13 labor tools live.
4. **5.2-D done** — 4 commission tools live.
5. **5.2-E done** — 4 bundle tools live.
6. **5.2-F done** — 3 rail tools live. **All 42 catalog writes complete.**
7. **5.2-G done** — protocol conformance proven for admin + sales.

## Acceptance Criteria

### Functional

- Admin token's `tools/list` returns all 63 tools (14 reads + 7 scenario writes + 42 catalog writes).
- Sales token's `tools/list` returns 16 tools (9 sales+admin reads + 7 scenario writes). No catalog tools leak.
- Every catalog-tool call by a sales token returns `-32002 Forbidden`.
- Every successful catalog-tool call appends an `ApiAuditLog` `OK` row.
- `delete_product` on a product referenced by any scenario returns an `ERROR` audit row; no cascade happens.
- `set_*` collection-replace tools atomically replace the full set.

### Non-functional

- `npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` all clean.
- No file in `lib/mcp/tools/catalog/*` imports Prisma.
- No behavior change to any Phase 1–5.1 test.

---

## Phase 5.2 → v2-complete handoff

At the end of Phase 5.2, MCP tool parity with the admin UI is achieved (except user management, by design). V2 is feature-complete modulo:

- Service-account tokens (deferred with HubSpot integration).
- HubSpot integration itself.
- Rate limiting + IP allowlists (revisit if abuse signals appear).
- Audit-log retention policy (currently unbounded).
