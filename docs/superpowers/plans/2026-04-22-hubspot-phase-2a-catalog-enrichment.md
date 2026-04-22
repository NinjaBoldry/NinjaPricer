# HubSpot Phase 2a — Catalog Enrichment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `description` + `sku @unique` columns to `Product` and `Bundle`, backfill SKUs from slugified names, resolve collisions via a dedicated admin tool, then wire the HubSpot catalog snapshot loader to surface the new fields in pushed HubSpot Products.

**Architecture:** Two-step migration — first add columns nullable, backfill + resolve collisions, then tighten with `@unique`. Admin UI gets a one-time SKU-collisions resolver page. Snapshot loader replaces hardcoded empty strings with the real Prisma values so Phase 1's manual `Push` now produces HubSpot Products with real SKUs + descriptions.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Prisma 6 + Postgres, Vitest, Shadcn UI.

**Spec reference:** [docs/superpowers/specs/2026-04-22-hubspot-phase-2-publish-approval-webhooks-design.md — "Catalog Enrichment (Phase 2 Pre-Work)"](../specs/2026-04-22-hubspot-phase-2-publish-approval-webhooks-design.md)

**Out of scope for 2a (moves to 2b):**
- `computeBundlePrice` extraction — only consumed at quote publish time; catalog sync doesn't need real bundle prices.
- All publish/approval/webhook code.

---

## File Structure

**Created:**
```
lib/utils/slugify.ts                                 — reusable slugifier
lib/utils/slugify.test.ts
scripts/backfill-product-bundle-skus.ts              — one-time SKU backfill runner
app/admin/sku-collisions/page.tsx                    — admin collision resolver
app/admin/sku-collisions/actions.ts                  — rename server action
app/admin/sku-collisions/RenameForm.tsx              — client form per-row
```

**Modified:**
```
prisma/schema.prisma                                 — description on Product; sku on both (nullable then @unique)
prisma/migrations/<ts>_product_description_sku_nullable/migration.sql
prisma/migrations/<ts>_product_bundle_sku_unique/migration.sql
lib/db/repositories/product.ts                       — accept description + sku in create/update
lib/db/repositories/bundle.ts                        — accept sku in create/update (description already exists)
lib/db/repositories/product.test.ts                  — adjust fixtures
lib/db/repositories/bundle.test.ts                   — adjust fixtures
lib/services/product.ts                              — validation for sku format + uniqueness
lib/services/bundle.ts                               — same
lib/services/product.test.ts
lib/services/bundle.test.ts
lib/mcp/tools/catalog/product.ts                     — extend Zod schemas with description + sku
lib/mcp/tools/catalog/bundles.ts                     — extend with sku (description already there)
lib/mcp/tools/catalog/product.test.ts
lib/mcp/tools/catalog/bundles.test.ts
app/admin/products/new/page.tsx                      — form fields
app/admin/products/[id]/page.tsx                     — edit form
app/admin/bundles/new/page.tsx                       — form field for sku
app/admin/bundles/[id]/page.tsx                      — sku field
lib/hubspot/catalog/snapshot.ts                      — use real Product.description/.sku and Bundle.sku
lib/hubspot/catalog/snapshot.db.test.ts              — update fixtures
package.json                                         — add "catalog:backfill-skus" script
```

---

## Task 1: Nullable columns migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1.1: Add `description` and `sku` to Product model**

In `prisma/schema.prisma`, find the `Product` block (around line 88). Inside the block, after `isActive`, add these two lines:

```prisma
  description           String?
  sku                   String?
```

- [ ] **Step 1.2: Add `sku` to Bundle model**

In `prisma/schema.prisma`, find the `Bundle` block (around line 292). Bundle already has `description String?` — leave it alone. After `description`, add:

```prisma
  sku         String?
```

- [ ] **Step 1.3: Generate migration**

Run: `npx prisma migrate dev --name product_description_sku_nullable --create-only`

Expected: new migration file appears under `prisma/migrations/<timestamp>_product_description_sku_nullable/migration.sql`. Open it and confirm it contains:
- `ALTER TABLE "Product" ADD COLUMN "description" TEXT, ADD COLUMN "sku" TEXT;`
- `ALTER TABLE "Bundle" ADD COLUMN "sku" TEXT;`

- [ ] **Step 1.4: Apply migration**

Run: `npx prisma migrate dev`

Expected: migration applied, types regenerated.

- [ ] **Step 1.5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(catalog): add nullable description + sku columns to Product and Bundle"
```

---

## Task 2: Slugify helper

**Files:**
- Create: `lib/utils/slugify.ts`
- Create: `lib/utils/slugify.test.ts`

- [ ] **Step 2.1: Write failing tests**

Create `lib/utils/slugify.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slugifyUpper } from './slugify';

describe('slugifyUpper', () => {
  it('replaces spaces with dashes and uppercases', () => {
    expect(slugifyUpper('Ninja Notes')).toBe('NINJA-NOTES');
  });

  it('collapses repeated whitespace', () => {
    expect(slugifyUpper('Ninja   Notes   Growth')).toBe('NINJA-NOTES-GROWTH');
  });

  it('strips non-alphanumeric characters except dashes', () => {
    expect(slugifyUpper('Ninja Notes! (Growth 2.0)')).toBe('NINJA-NOTES-GROWTH-2-0');
  });

  it('collapses repeated dashes', () => {
    expect(slugifyUpper('Ninja--Notes---Growth')).toBe('NINJA-NOTES-GROWTH');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugifyUpper('-Ninja Notes-')).toBe('NINJA-NOTES');
  });

  it('returns empty string for empty input', () => {
    expect(slugifyUpper('')).toBe('');
    expect(slugifyUpper('   ')).toBe('');
  });

  it('handles unicode by stripping non-ASCII alphanumerics', () => {
    expect(slugifyUpper('Niñja Nötes')).toBe('NI-JA-N-TES');
  });
});
```

- [ ] **Step 2.2: Run test — should fail**

Run: `npm test -- lib/utils/slugify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement**

Create `lib/utils/slugify.ts`:

```ts
export function slugifyUpper(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

- [ ] **Step 2.4: Run test — should pass**

Run: `npm test -- lib/utils/slugify.test.ts`
Expected: 7 PASS.

- [ ] **Step 2.5: Commit**

```bash
git add lib/utils/slugify.ts lib/utils/slugify.test.ts
git commit -m "feat(utils): slugifyUpper helper for SKU generation"
```

---

## Task 3: SKU backfill script

**Files:**
- Create: `scripts/backfill-product-bundle-skus.ts`
- Modify: `package.json` (add npm script)

- [ ] **Step 3.1: Implement backfill script**

Create `scripts/backfill-product-bundle-skus.ts`:

```ts
#!/usr/bin/env tsx
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { slugifyUpper } from '../lib/utils/slugify';

interface CollisionRow {
  sku: string;
  owners: Array<{ kind: 'PRODUCT' | 'BUNDLE'; id: string; name: string }>;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const products = await prisma.product.findMany({ select: { id: true, name: true, sku: true } });
    const bundles = await prisma.bundle.findMany({ select: { id: true, name: true, sku: true } });

    const proposals: Array<{ kind: 'PRODUCT' | 'BUNDLE'; id: string; name: string; proposedSku: string; currentSku: string | null }> = [];

    for (const p of products) {
      proposals.push({
        kind: 'PRODUCT',
        id: p.id,
        name: p.name,
        proposedSku: slugifyUpper(p.name),
        currentSku: p.sku,
      });
    }
    for (const b of bundles) {
      proposals.push({
        kind: 'BUNDLE',
        id: b.id,
        name: b.name,
        proposedSku: slugifyUpper(b.name),
        currentSku: b.sku,
      });
    }

    // Detect collisions across the combined proposed-SKU space
    const bySku = new Map<string, CollisionRow['owners']>();
    for (const pr of proposals) {
      if (!pr.proposedSku) {
        console.warn(`  [skip-empty] ${pr.kind} ${pr.id} "${pr.name}" produced empty SKU`);
        continue;
      }
      const list = bySku.get(pr.proposedSku) ?? [];
      list.push({ kind: pr.kind, id: pr.id, name: pr.name });
      bySku.set(pr.proposedSku, list);
    }

    const collisions: CollisionRow[] = [];
    for (const [sku, owners] of bySku.entries()) {
      if (owners.length > 1) collisions.push({ sku, owners });
    }

    if (collisions.length > 0) {
      console.error(`\n${collisions.length} SKU collision(s) detected:`);
      for (const c of collisions) {
        console.error(`\n  SKU "${c.sku}":`);
        for (const o of c.owners) console.error(`    - ${o.kind} ${o.id}  "${o.name}"`);
      }
      console.error('\nResolve collisions in /admin/sku-collisions (rename one side) and re-run this script.');
      process.exit(2);
    }

    // No collisions — apply
    let updatedProducts = 0;
    let updatedBundles = 0;
    let skippedEmpty = 0;

    for (const pr of proposals) {
      if (!pr.proposedSku) {
        skippedEmpty++;
        continue;
      }
      if (pr.currentSku === pr.proposedSku) continue; // already correct
      if (pr.kind === 'PRODUCT') {
        await prisma.product.update({ where: { id: pr.id }, data: { sku: pr.proposedSku } });
        updatedProducts++;
      } else {
        await prisma.bundle.update({ where: { id: pr.id }, data: { sku: pr.proposedSku } });
        updatedBundles++;
      }
    }

    console.log(`Done. Products updated: ${updatedProducts}. Bundles updated: ${updatedBundles}. Skipped (empty SKU): ${skippedEmpty}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3.2: Add npm script**

Modify `package.json`, under the `"scripts"` block, add:

```json
"catalog:backfill-skus": "tsx scripts/backfill-product-bundle-skus.ts"
```

- [ ] **Step 3.3: Smoke-test locally**

Run: `npm run catalog:backfill-skus`

Expected (against the dev DB with the seeded catalog): either "Done." with the number of updated rows, or a "SKU collisions detected" error listing names. Either outcome is fine — the collisions case is what `/admin/sku-collisions` will resolve.

- [ ] **Step 3.4: Commit**

```bash
git add scripts/backfill-product-bundle-skus.ts package.json
git commit -m "feat(catalog): backfill script populates Product/Bundle SKUs from slugified names"
```

---

## Task 4: SKU collisions admin UI

**Files:**
- Create: `app/admin/sku-collisions/page.tsx`
- Create: `app/admin/sku-collisions/RenameForm.tsx`
- Create: `app/admin/sku-collisions/actions.ts`

- [ ] **Step 4.1: Implement server actions**

Create `app/admin/sku-collisions/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

export async function renameProductAction(input: { id: string; newName: string }) {
  await requireAdmin();
  const name = input.newName.trim();
  if (!name) throw new Error('Name cannot be empty');
  await prisma.product.update({ where: { id: input.id }, data: { name } });
  revalidatePath('/admin/sku-collisions');
}

export async function renameBundleAction(input: { id: string; newName: string }) {
  await requireAdmin();
  const name = input.newName.trim();
  if (!name) throw new Error('Name cannot be empty');
  await prisma.bundle.update({ where: { id: input.id }, data: { name } });
  revalidatePath('/admin/sku-collisions');
}

export async function setProductSkuAction(input: { id: string; sku: string }) {
  await requireAdmin();
  const sku = input.sku.trim().toUpperCase();
  if (!sku) throw new Error('SKU cannot be empty');
  await prisma.product.update({ where: { id: input.id }, data: { sku } });
  revalidatePath('/admin/sku-collisions');
}

export async function setBundleSkuAction(input: { id: string; sku: string }) {
  await requireAdmin();
  const sku = input.sku.trim().toUpperCase();
  if (!sku) throw new Error('SKU cannot be empty');
  await prisma.bundle.update({ where: { id: input.id }, data: { sku } });
  revalidatePath('/admin/sku-collisions');
}
```

- [ ] **Step 4.2: Implement rename client component**

Create `app/admin/sku-collisions/RenameForm.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { setProductSkuAction, setBundleSkuAction } from './actions';

export function SetSkuForm({ kind, id, currentSku }: { kind: 'PRODUCT' | 'BUNDLE'; id: string; currentSku: string }) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(currentSku);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          if (kind === 'PRODUCT') await setProductSkuAction({ id, sku: value });
          else await setBundleSkuAction({ id, sku: value });
        });
      }}
      className="inline-flex gap-2"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      />
      <button type="submit" disabled={pending} className="text-xs px-2 py-1 border rounded disabled:opacity-50">
        {pending ? '…' : 'Save SKU'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4.3: Implement page**

Create `app/admin/sku-collisions/page.tsx`:

```tsx
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { slugifyUpper } from '@/lib/utils/slugify';
import { SetSkuForm } from './RenameForm';

export const dynamic = 'force-dynamic';

interface Collision {
  sku: string;
  owners: Array<{ kind: 'PRODUCT' | 'BUNDLE'; id: string; name: string; currentSku: string | null }>;
}

export default async function SkuCollisionsPage() {
  await requireAdmin();

  const products = await prisma.product.findMany({ select: { id: true, name: true, sku: true } });
  const bundles = await prisma.bundle.findMany({ select: { id: true, name: true, sku: true } });

  const bySku = new Map<string, Collision['owners']>();

  const track = (kind: 'PRODUCT' | 'BUNDLE', id: string, name: string, currentSku: string | null) => {
    const proposed = currentSku ?? slugifyUpper(name);
    if (!proposed) return;
    const list = bySku.get(proposed) ?? [];
    list.push({ kind, id, name, currentSku });
    bySku.set(proposed, list);
  };

  for (const p of products) track('PRODUCT', p.id, p.name, p.sku);
  for (const b of bundles) track('BUNDLE', b.id, b.name, b.sku);

  const collisions: Collision[] = [];
  for (const [sku, owners] of bySku.entries()) {
    if (owners.length > 1) collisions.push({ sku, owners });
  }

  return (
    <main className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">SKU Collisions</h1>

      {collisions.length === 0 && (
        <p className="text-muted-foreground">No SKU collisions. Safe to tighten the unique constraint.</p>
      )}

      {collisions.map((c) => (
        <section key={c.sku} className="border rounded-md p-4">
          <h2 className="font-medium mb-2">Collision on SKU: <code>{c.sku}</code></h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1">Kind</th>
                <th>Name</th>
                <th>Current SKU</th>
                <th>New SKU</th>
              </tr>
            </thead>
            <tbody>
              {c.owners.map((o) => (
                <tr key={`${o.kind}:${o.id}`} className="border-b">
                  <td className="py-2">{o.kind}</td>
                  <td>{o.name}</td>
                  <td><code className="text-xs">{o.currentSku ?? '(unset)'}</code></td>
                  <td>
                    <SetSkuForm kind={o.kind} id={o.id} currentSku={o.currentSku ?? c.sku} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <p className="text-xs text-muted-foreground pt-4">
        After all collisions are resolved and <code>npm run catalog:backfill-skus</code> reports zero collisions,
        run the second migration: <code>npx prisma migrate dev --name product_bundle_sku_unique</code>.
      </p>
    </main>
  );
}
```

- [ ] **Step 4.4: Smoke test**

Run: `npm run dev`. Visit `/admin/sku-collisions`. Page should render without error. If the dev DB has no collisions, the "No SKU collisions" message appears.

- [ ] **Step 4.5: Commit**

```bash
git add app/admin/sku-collisions
git commit -m "feat(catalog): admin SKU collisions resolver page"
```

---

## Task 5: Extend Product + Bundle repositories with description + sku

**Files:**
- Modify: `lib/db/repositories/product.ts`
- Modify: `lib/db/repositories/product.test.ts`
- Modify: `lib/db/repositories/bundle.ts`
- Modify: `lib/db/repositories/bundle.test.ts`

- [ ] **Step 5.1: Extend ProductRepository**

Open `lib/db/repositories/product.ts`. Modify the `create` and `update` method signatures to accept `description` and `sku`:

```ts
async create(data: { name: string; kind: ProductKind; isActive: boolean; description?: string | null; sku?: string | null }): Promise<Product> {
  return this.db.product.create({ data });
}

async update(
  id: string,
  data: Partial<{ name: string; isActive: boolean; description: string | null; sku: string | null }>,
): Promise<Product> {
  return this.db.product.update({ where: { id }, data });
}
```

- [ ] **Step 5.2: Extend ProductRepository test with a description/sku case**

Open `lib/db/repositories/product.test.ts`. At the bottom of the describe block, add:

```ts
  it('create persists description and sku when provided', async () => {
    const created = await repo.create({
      name: 'Descriptive Product',
      kind: ProductKind.SAAS_USAGE,
      isActive: true,
      description: 'A lovely product',
      sku: 'DP-001',
    });
    expect(created.description).toBe('A lovely product');
    expect(created.sku).toBe('DP-001');
  });
```

(Adjust the import + imports list if `ProductKind` isn't already in scope; it is in the existing file.)

- [ ] **Step 5.3: Run test**

Run: `npm run test:integration -- lib/db/repositories/product.test.ts`
Expected: new test PASS, existing tests still PASS.

- [ ] **Step 5.4: Extend BundleRepository**

Open `lib/db/repositories/bundle.ts`. Modify `create` / `update` to accept `sku` (bundle already has `description`). Look at the file for the current signatures and add `sku?: string | null` to both.

- [ ] **Step 5.5: Extend BundleRepository test**

Open `lib/db/repositories/bundle.test.ts`. Add a test similar to Step 5.2 but for bundle, asserting SKU persists.

- [ ] **Step 5.6: Run tests**

Run: `npm run test:integration -- lib/db/repositories/bundle.test.ts`
Expected: new test PASS, existing PASS.

- [ ] **Step 5.7: Commit**

```bash
git add lib/db/repositories/product.ts lib/db/repositories/product.test.ts lib/db/repositories/bundle.ts lib/db/repositories/bundle.test.ts
git commit -m "feat(catalog): product + bundle repositories accept description + sku"
```

---

## Task 6: Services + MCP tool + admin forms

**Files:**
- Modify: `lib/services/product.ts` + `.test.ts`
- Modify: `lib/services/bundle.ts` + `.test.ts`
- Modify: `lib/mcp/tools/catalog/product.ts` + `.test.ts`
- Modify: `lib/mcp/tools/catalog/bundles.ts` + `.test.ts`
- Modify: `app/admin/products/new/page.tsx`, `app/admin/products/[id]/page.tsx`
- Modify: `app/admin/bundles/new/page.tsx`, `app/admin/bundles/[id]/page.tsx`

- [ ] **Step 6.1: Extend service validation**

Open each service file in order. For each `create` / `update` function, thread through the new optional fields. Validation:

- `description`: trim; if provided and empty after trim, coerce to `null`.
- `sku`: trim + `toUpperCase()`; validate regex `^[A-Z0-9-]+$` (alphanumerics + dashes only); coerce empty to `null`.

Test each validation edge case: empty string, mixed case, invalid chars. Follow the existing service test style.

- [ ] **Step 6.2: Run service tests**

Run: `npm test -- lib/services/product.test.ts lib/services/bundle.test.ts`
Expected: all PASS.

- [ ] **Step 6.3: Extend MCP tool Zod schemas**

Open `lib/mcp/tools/catalog/product.ts`. Find `createProductSchema` and `updateProductSchema`. Add optional fields:

```ts
description: z.string().trim().nullable().optional(),
sku: z.string().trim().nullable().optional(),
```

Same pattern in `lib/mcp/tools/catalog/bundles.ts` (bundle already has description, just add sku).

- [ ] **Step 6.4: Extend MCP tool tests**

Add one test per tool file asserting that description + sku flow through the handler into the service call.

Run: `npm test -- lib/mcp/tools/catalog/`
Expected: all PASS.

- [ ] **Step 6.5: Extend admin UI forms — Product**

Open `app/admin/products/new/page.tsx` and `app/admin/products/[id]/page.tsx`. Add two text inputs to the existing form, matching the pattern of the existing `name` input:

- **Description** (textarea, optional, placeholder "Short marketing description shown on customer quotes")
- **SKU** (single-line input, optional, placeholder "Auto-generated from name if blank", `style={{textTransform: 'uppercase'}}`)

Wire them into the same server action the form already uses. If the server action signature needs expansion, extend it now.

- [ ] **Step 6.6: Extend admin UI forms — Bundle**

Same pattern for `app/admin/bundles/new/page.tsx` and `app/admin/bundles/[id]/page.tsx`. Bundle's edit page likely already has a description field — leave it. Add a SKU input.

- [ ] **Step 6.7: Smoke test**

Run: `npm run dev`. Create a new product with description + SKU; edit an existing product and change the SKU; same for a bundle. Verify persistence in Prisma Studio (`npx prisma studio`).

- [ ] **Step 6.8: Commit**

```bash
git add lib/services/product.ts lib/services/product.test.ts lib/services/bundle.ts lib/services/bundle.test.ts \
  lib/mcp/tools/catalog/product.ts lib/mcp/tools/catalog/product.test.ts \
  lib/mcp/tools/catalog/bundles.ts lib/mcp/tools/catalog/bundles.test.ts \
  app/admin/products app/admin/bundles
git commit -m "feat(catalog): product + bundle services, MCP tools, and admin forms accept description + sku"
```

---

## Task 7: Run backfill + resolve collisions locally

This task is a **manual operational step** against the dev database. No code changes; document the steps ran.

- [ ] **Step 7.1: Run the backfill script**

Run: `npm run catalog:backfill-skus`

- If output is "Done." with counts → Step 7.3.
- If output lists collisions → Step 7.2.

- [ ] **Step 7.2: Resolve collisions**

Visit `http://localhost:3000/admin/sku-collisions` (must be logged in as ADMIN). For each collision, edit one row's SKU to a distinct value (follow the convention you want — e.g., `NINJA-NOTES` vs `NINJA-NOTES-BUNDLE`).

Re-run `npm run catalog:backfill-skus` until it reports "Done." with no collisions.

- [ ] **Step 7.3: Verify**

Run: `npx prisma studio`. Check Product and Bundle tables — every row has a non-null `sku`. No two rows share a sku.

This is a prereq for Task 8. No commit in this task — it's data setup.

---

## Task 8: Unique-constraint migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 8.1: Tighten sku constraint**

In `prisma/schema.prisma`:

- Product: change `sku String?` to `sku String? @unique`
- Bundle: same

(Kept nullable to match Prisma semantics — null values don't collide with `@unique` in Postgres.)

- [ ] **Step 8.2: Generate migration**

Run: `npx prisma migrate dev --name product_bundle_sku_unique --create-only`

Expected: migration with `CREATE UNIQUE INDEX` statements on `Product.sku` and `Bundle.sku`.

- [ ] **Step 8.3: Apply migration**

Run: `npx prisma migrate dev`
Expected: migration applied cleanly (fails if Task 7 collisions weren't resolved — re-do Task 7 first).

- [ ] **Step 8.4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(catalog): tighten Product.sku and Bundle.sku to @unique"
```

---

## Task 9: Wire catalog snapshot to real description + sku

**Files:**
- Modify: `lib/hubspot/catalog/snapshot.ts`
- Modify: `lib/hubspot/catalog/snapshot.db.test.ts`

- [ ] **Step 9.1: Update snapshot loader to pass real fields**

Open `lib/hubspot/catalog/snapshot.ts`. Find the product mapping (currently sets `sku: ''` and `description: ''`). Replace with:

```ts
sku: p.sku ?? '',
description: p.description ?? '',
```

Same for bundles:

```ts
sku: b.sku ?? '',
description: b.description ?? '',
```

- [ ] **Step 9.2: Update snapshot test**

Open `lib/hubspot/catalog/snapshot.db.test.ts`. In the existing "returns only active products" test, update the Prisma create call to include `description: 'Note capture'` and `sku: 'NN-01'`. Add assertions that the snapshot output contains those exact values.

Add one additional test: "returns empty string when product has no description or sku" — creates a product with those fields null, asserts snapshot returns `description: ''` and `sku: ''`.

- [ ] **Step 9.3: Run test**

Run: `npm run test:integration -- lib/hubspot/catalog/snapshot.db.test.ts`
Expected: all PASS.

- [ ] **Step 9.4: Commit**

```bash
git add lib/hubspot/catalog/snapshot.ts lib/hubspot/catalog/snapshot.db.test.ts
git commit -m "feat(hubspot): snapshot loader surfaces real product and bundle description + sku"
```

---

## Task 10: Final verification

- [ ] **Step 10.1: Run full test suite**

```
npm test
npm run test:integration
```

Expected: all pass, no failures that weren't pre-existing.

- [ ] **Step 10.2: Lint + format + build**

```
npm run lint
npm run format:check
npm run build
```

Expected: all clean.

- [ ] **Step 10.3: Smoke HubSpot sync (optional, if HubSpot token is set)**

Set `HUBSPOT_ACCESS_TOKEN` in the environment and run:

```bash
npm run dev
```

Visit `/admin/hubspot/sync`, click **Push catalog to HubSpot**. Spot-check a product or bundle in HubSpot — it should now have `hs_sku` and `description` populated from the pricer's real fields rather than blank.

- [ ] **Step 10.4: Commit any lint/format fixes**

```bash
git add -A
git commit -m "chore(catalog): phase 2a lint + format" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage** (Phase 2a pre-work portion of [the Phase 2 spec](../specs/2026-04-22-hubspot-phase-2-publish-approval-webhooks-design.md)):
  - Nullable columns (Task 1) ✓
  - Slug-based backfill (Tasks 2 + 3) ✓
  - Collision resolver UI (Task 4) ✓
  - Service + MCP + admin UI enrichment (Tasks 5 + 6) ✓
  - Collision resolution flow (Task 7, operational) ✓
  - Unique constraint (Task 8) ✓
  - Snapshot wiring (Task 9) ✓
  - Verification (Task 10) ✓
- **Deferred to Phase 2b:** `computeBundlePrice` extraction. It's only consumed at quote publish time, and the Phase 1 catalog snapshot passes `rolledUpMonthlyPrice = Decimal(0)` which becomes the HubSpot Product's `price` — HubSpot Products' price is informational (not what the customer sees on a Quote line item), so 0 is harmless until Phase 2b lands real bundle pricing.
- **No placeholders** — every step shows exact code, file paths, commands.
- **Type consistency** — `description`, `sku`, `slugifyUpper` used consistently across tasks.
- **Known gotchas:**
  - Task 5/6 assume existing service + MCP + admin UI files; subagents should read each one before modifying, since the existing signatures and forms vary.
  - Task 7 is manual — a subagent running the plan will need to execute the backfill + collision resolution themselves (using the dev DB) before Task 8 can succeed.
