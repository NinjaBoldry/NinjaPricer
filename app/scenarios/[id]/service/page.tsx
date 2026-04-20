import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import LaborLineTable from '@/components/scenarios/LaborLineTable';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { addServiceLine, deleteServiceLine } from './actions';

export default async function ServiceTabPage({ params }: { params: { id: string } }) {
  const user = await requireAuth();
  const repo = new ScenarioRepository(prisma);
  const scenario = await repo.findById(params.id);
  if (!scenario) notFound();

  const product = await prisma.product.findFirst({
    where: { kind: 'CUSTOM_LABOR', isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    include: { billRate: true },
    orderBy: { name: 'asc' },
  });

  const lines = product ? scenario.laborLines.filter((l) => l.productId === product.id) : [];

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold mb-4">Professional Services</h2>

      <LaborLineTable lines={lines} userRole={user.role} deleteAction={deleteServiceLine} />

      {product && (
        <details className="mt-6 border rounded-lg p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Add service line
          </summary>
          <form action={addServiceLine} className="mt-4 space-y-3">
            <input type="hidden" name="scenarioId" value={params.id} />
            <input type="hidden" name="productId" value={product.id} />
            <div className="space-y-1">
              <Label htmlFor="departmentId">Department</Label>
              <select
                id="departmentId"
                name="departmentId"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                <option value="">Select department…</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                    {dept.billRate
                      ? ` (bill rate $${dept.billRate.billRatePerHour.toString()}/hr)`
                      : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <div className="space-y-1 flex-1">
                <Label htmlFor="qty">Hours</Label>
                <Input id="qty" name="qty" type="number" step="0.5" min="0" defaultValue="1" />
              </div>
              <div className="space-y-1 flex-1">
                <Label htmlFor="revenuePerUnit">Rev/hr override ($)</Label>
                <Input
                  id="revenuePerUnit"
                  name="revenuePerUnit"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Leave blank for dept bill rate"
                />
              </div>
            </div>
            <Button type="submit" size="sm">
              Add line
            </Button>
          </form>
        </details>
      )}

      {!product && (
        <p className="text-sm text-slate-400 mt-4">
          No active Custom Labor product configured. Add one in admin settings.
        </p>
      )}
    </div>
  );
}
