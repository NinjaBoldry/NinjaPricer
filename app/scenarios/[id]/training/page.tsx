import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import LaborLineTable from '@/components/scenarios/LaborLineTable';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  addTrainingLineFromSKU,
  addCustomTrainingLine,
  deleteTrainingLine,
} from './actions';

export default async function TrainingTabPage({ params }: { params: { id: string } }) {
  const user = await requireAuth();
  const repo = new ScenarioRepository(prisma);
  const scenario = await repo.findById(params.id);
  if (!scenario) notFound();

  const product = await prisma.product.findFirst({
    where: { kind: 'PACKAGED_LABOR', isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { laborSKUs: { where: { isActive: true }, orderBy: { name: 'asc' } } },
  });

  const lines = product
    ? scenario.laborLines.filter((l) => l.productId === product.id)
    : [];

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold mb-4">Training &amp; White-glove</h2>

      <LaborLineTable lines={lines} userRole={user.role} deleteAction={deleteTrainingLine} />

      {product && (
        <>
          <details className="mt-6 border rounded-lg p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Add from SKU
            </summary>
            <form action={addTrainingLineFromSKU} className="mt-4 space-y-3">
              <input type="hidden" name="scenarioId" value={params.id} />
              <input type="hidden" name="productId" value={product.id} />
              <div className="space-y-1">
                <Label htmlFor="skuId">SKU</Label>
                <select
                  id="skuId"
                  name="skuId"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select SKU…</option>
                  {product.laborSKUs.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.name} (${sku.defaultRevenueUsd.toString()}/{sku.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="space-y-1 flex-1">
                  <Label htmlFor="qty">Qty</Label>
                  <Input id="qty" name="qty" type="number" step="0.5" min="0" defaultValue="1" />
                </div>
                <div className="space-y-1 flex-1">
                  <Label htmlFor="revenuePerUnit">Rev/unit override ($)</Label>
                  <Input id="revenuePerUnit" name="revenuePerUnit" type="number" step="0.01" min="0" placeholder="Leave blank for SKU default" />
                </div>
              </div>
              <Button type="submit" size="sm">Add line</Button>
            </form>
          </details>

          <details className="mt-3 border rounded-lg p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Add custom line
            </summary>
            <form action={addCustomTrainingLine} className="mt-4 space-y-3">
              <input type="hidden" name="scenarioId" value={params.id} />
              <input type="hidden" name="productId" value={product.id} />
              <div className="space-y-1">
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" required placeholder="Custom training session" />
              </div>
              <div className="flex gap-3">
                <div className="space-y-1 flex-1">
                  <Label htmlFor="cqty">Qty</Label>
                  <Input id="cqty" name="qty" type="number" step="0.5" min="0" defaultValue="1" />
                </div>
                <div className="space-y-1 flex-1">
                  <Label htmlFor="unit">Unit</Label>
                  <Input id="unit" name="unit" placeholder="session" />
                </div>
                <div className="space-y-1 flex-1">
                  <Label htmlFor="revenuePerUnit">Rev/unit ($)</Label>
                  <Input id="revenuePerUnit" name="revenuePerUnit" type="number" step="0.01" min="0" required />
                </div>
              </div>
              <Button type="submit" size="sm">Add line</Button>
            </form>
          </details>
        </>
      )}
    </div>
  );
}
