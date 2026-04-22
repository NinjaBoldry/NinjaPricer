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

  const collisions: Collision[] = Array.from(bySku.entries())
    .filter(([, owners]) => owners.length > 1)
    .map(([sku, owners]) => ({ sku, owners }));

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
