import { requireAuth } from '@/lib/auth/session';
import { listMyTokensAction } from './actions';
import NewTokenDialog from './NewTokenDialog';
import RevokeButton from './RevokeButton';

export const dynamic = 'force-dynamic';

export default async function SettingsTokensPage() {
  await requireAuth();
  const tokens = await listMyTokensAction();

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">API tokens</h1>
          <p className="text-sm text-muted-foreground">
            Issue tokens for Cowork, Claude Code, or any MCP client. Raw token is shown once at
            creation.
          </p>
        </div>
        <NewTokenDialog />
      </div>

      {tokens.length === 0 ? (
        <p className="text-sm">No tokens yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left border-b">
            <tr>
              <th className="py-2">Label</th>
              <th>Prefix</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Expires</th>
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
                  <td className="py-2">{t.label}</td>
                  <td className="font-mono text-xs">{t.tokenPrefix}…</td>
                  <td>{t.createdAt.toISOString().slice(0, 10)}</td>
                  <td>{t.lastUsedAt?.toISOString().slice(0, 10) ?? '—'}</td>
                  <td>{t.expiresAt?.toISOString().slice(0, 10) ?? 'never'}</td>
                  <td>{status}</td>
                  <td>{status === 'active' && <RevokeButton tokenId={t.id} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
