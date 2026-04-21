import { requireAdmin } from '@/lib/auth/session';
import { listAllTokensAction } from './actions';
import TokenDrawer from './TokenDrawer';

export const dynamic = 'force-dynamic';

export default async function AdminTokensPage() {
  await requireAdmin();
  const tokens = await listAllTokensAction();

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">API tokens (all users)</h1>
        <p className="text-sm text-muted-foreground">
          Revoke any token. Click a row to view its recent audit log.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left border-b">
          <tr>
            <th className="py-2">Owner</th>
            <th>Role</th>
            <th>Label</th>
            <th>Prefix</th>
            <th>Created</th>
            <th>Last used</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => {
            const status = t.revokedAt
              ? 'revoked'
              : t.expiresAt && t.expiresAt.getTime() < Date.now()
                ? 'expired'
                : 'active';
            return (
              <tr key={t.id} className="border-b">
                <td className="py-2">{t.owner?.email ?? '—'}</td>
                <td>{t.owner?.role ?? '—'}</td>
                <td>{t.label}</td>
                <td className="font-mono text-xs">{t.tokenPrefix}…</td>
                <td>{t.createdAt.toISOString().slice(0, 10)}</td>
                <td>{t.lastUsedAt?.toISOString().slice(0, 10) ?? '—'}</td>
                <td>{status}</td>
                <td>
                  <TokenDrawer tokenId={t.id} label={t.label} status={status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
