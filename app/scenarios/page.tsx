import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { ScenarioRepository } from '@/lib/db/repositories/scenario';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ScenarioStatus } from '@prisma/client';

const VALID_STATUSES: ScenarioStatus[] = ['DRAFT', 'QUOTED', 'ARCHIVED'];

export default async function ScenariosPage({
  searchParams,
}: {
  searchParams: { customer?: string; status?: string };
}) {
  const user = await requireAuth();
  const repo = new ScenarioRepository(prisma);

  const status =
    searchParams.status && VALID_STATUSES.includes(searchParams.status as ScenarioStatus)
      ? (searchParams.status as ScenarioStatus)
      : undefined;

  const scenarios = await repo.listWithFilters({
    actingUser: { id: user.id, role: user.role },
    ...(searchParams.customer ? { customerName: searchParams.customer } : {}),
    ...(status ? { status } : {}),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Scenarios</h1>
        <Link href="/scenarios/new" className={buttonVariants()}>
          New scenario
        </Link>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="pb-2 pr-6 font-medium">Name</th>
            <th className="pb-2 pr-6 font-medium">Customer</th>
            <th className="pb-2 pr-6 font-medium">Status</th>
            <th className="pb-2 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((s) => (
            <tr key={s.id} className="border-b last:border-0">
              <td className="py-3 pr-6">
                <Link href={`/scenarios/${s.id}`} className="font-medium hover:underline">
                  {s.name}
                </Link>
              </td>
              <td className="py-3 pr-6 text-slate-600">{s.customerName}</td>
              <td className="py-3 pr-6">
                <Badge variant={s.status === 'DRAFT' ? 'secondary' : 'default'}>{s.status}</Badge>
              </td>
              <td className="py-3 text-slate-500 text-xs">
                {new Date(s.updatedAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
          {scenarios.length === 0 && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-slate-400 text-sm">
                No scenarios yet. Create one to get started.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
