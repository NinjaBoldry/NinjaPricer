import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { signOut } from '@/auth';

export async function TopNav() {
  const user = await getSessionUser();
  return (
    <header className="border-b bg-white">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/scenarios" className="font-semibold">
            Ninja Pricer
          </Link>
          <Link href="/scenarios" className="text-sm">
            My Scenarios
          </Link>
          {user?.role === 'ADMIN' && (
            <Link href="/admin" className="text-sm">
              Admin
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-600">{user?.email}</span>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button type="submit" className="text-blue-600 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </nav>
    </header>
  );
}
