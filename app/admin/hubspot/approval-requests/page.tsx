import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

type Filter = 'pending' | 'all';

export default async function ApprovalRequestsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  await requireAdmin();

  const filter: Filter = searchParams.filter === 'pending' ? 'pending' : 'all';

  const rows =
    filter === 'pending'
      ? await prisma.hubSpotApprovalRequest.findMany({
          where: { status: 'PENDING' },
          orderBy: { submittedAt: 'desc' },
          take: 200,
          include: { scenario: { select: { id: true, name: true } } },
        })
      : await prisma.hubSpotApprovalRequest.findMany({
          orderBy: { submittedAt: 'desc' },
          take: 200,
          include: { scenario: { select: { id: true, name: true } } },
        });

  const statusBadge = (status: string) => {
    if (status === 'PENDING')
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          PENDING
        </span>
      );
    if (status === 'APPROVED')
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
          APPROVED
        </span>
      );
    if (status === 'REJECTED')
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
          REJECTED
        </span>
      );
    return <span className="font-mono text-xs">{status}</span>;
  };

  return (
    <main className="p-6 space-y-4 max-w-6xl">
      <h1 className="text-2xl font-semibold">HubSpot Approval Requests</h1>

      <div className="flex gap-3 text-sm">
        <Link
          href="/admin/hubspot/approval-requests?filter=all"
          className={filter === 'all' ? 'font-semibold underline' : 'underline text-blue-600'}
        >
          All
        </Link>
        <Link
          href="/admin/hubspot/approval-requests?filter=pending"
          className={filter === 'pending' ? 'font-semibold underline' : 'underline text-blue-600'}
        >
          Pending only
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        Most recent 200 entries.{' '}
        {filter === 'pending' ? 'Showing PENDING requests only.' : 'Showing all statuses.'}
      </p>

      {rows.length === 0 && (
        <p className="text-muted-foreground">No approval requests found.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Scenario</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Submitted</th>
                <th className="py-2 pr-4">HubSpot Deal</th>
                <th className="py-2 pr-4">Resolved</th>
                <th className="py-2">Resolved by (HS Owner)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((req) => (
                <tr key={req.id} className="border-b align-top">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/scenarios/${req.scenario.id}/hubspot`}
                      className="font-medium underline text-blue-600"
                    >
                      {req.scenario.name}
                    </Link>
                    <div className="text-xs text-muted-foreground font-mono">{req.scenarioId}</div>
                  </td>
                  <td className="py-2 pr-4">{statusBadge(req.status)}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                    {req.submittedAt.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    <a
                      href={`https://app.hubspot.com/contacts/deals/${req.hubspotDealId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs underline text-blue-600"
                    >
                      {req.hubspotDealId}
                    </a>
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                    {req.resolvedAt ? req.resolvedAt.toLocaleString() : '—'}
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {req.resolvedByHubspotOwnerId ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
