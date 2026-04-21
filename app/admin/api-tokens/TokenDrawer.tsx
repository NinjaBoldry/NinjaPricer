'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { listAuditForTokenAction, adminRevokeTokenAction } from './actions';

interface Props {
  tokenId: string;
  label: string;
  status: string;
}

interface AuditRow {
  id: string;
  createdAt: string | Date;
  toolName: string;
  result: 'OK' | 'ERROR';
  errorCode?: string | null;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
}

export default function TokenDrawer({ tokenId, label, status }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  async function openDrawer() {
    setOpen(true);
    const audit = await listAuditForTokenAction(tokenId);
    setRows(audit as AuditRow[]);
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDrawer}>
        View
      </Button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="fixed top-0 right-0 bottom-0 w-[28rem] bg-white dark:bg-gray-900 p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{label}</h2>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Status: {status}</p>
            {status === 'active' && (
              <form
                action={async (fd) => {
                  await adminRevokeTokenAction(fd);
                  setOpen(false);
                  router.refresh();
                }}
                className="mt-3"
              >
                <input type="hidden" name="tokenId" value={tokenId} />
                <Button type="submit" variant="destructive" size="sm">
                  Revoke
                </Button>
              </form>
            )}
            <h3 className="text-md font-semibold mt-4">Last 50 calls</h3>
            {rows === null ? (
              <p className="text-sm">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No write activity yet.</p>
            ) : (
              <ul className="text-xs space-y-1 mt-2">
                {rows.map((r) => (
                  <li key={r.id} className="flex gap-2 border-b py-1">
                    <span className="font-mono">
                      {new Date(r.createdAt).toISOString().slice(0, 19).replace('T', ' ')}
                    </span>
                    <span>{r.toolName}</span>
                    {r.targetEntityType && (
                      <span className="text-muted-foreground">
                        → {r.targetEntityType}:{r.targetEntityId}
                      </span>
                    )}
                    <span className={r.result === 'OK' ? 'text-green-700' : 'text-red-700'}>
                      {r.result}
                      {r.errorCode ? ` (${r.errorCode})` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
