'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { issueMyTokenAction } from './actions';

export default function NewTokenDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      const { rawToken } = await issueMyTokenAction(formData);
      setIssued(rawToken);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPending(false);
    }
  }

  if (issued) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
        <div className="bg-white dark:bg-gray-900 rounded p-6 max-w-lg space-y-3">
          <h2 className="text-lg font-semibold">Copy this token now</h2>
          <p className="text-sm">It won&apos;t be shown again. Save it somewhere safe.</p>
          <code className="block p-3 text-xs bg-gray-100 dark:bg-gray-800 break-all font-mono">{issued}</code>
          <Button
            variant="destructive"
            onClick={() => {
              setIssued(null);
              setOpen(false);
            }}
          >
            I&apos;ve saved it — close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>New token</Button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
          <form
            action={submit}
            className="bg-white dark:bg-gray-900 rounded p-6 max-w-md space-y-3"
          >
            <h2 className="text-lg font-semibold">Issue API token</h2>
            <div>
              <label className="block text-sm">Label</label>
              <input name="label" required className="w-full border rounded px-2 py-1" placeholder="e.g. Cowork" />
            </div>
            <div>
              <label className="block text-sm">Expires at (optional)</label>
              <input name="expiresAt" type="date" className="w-full border rounded px-2 py-1" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Issuing…' : 'Issue'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
