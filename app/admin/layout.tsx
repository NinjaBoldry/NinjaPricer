import { requireAdmin } from '@/lib/auth/session';
import { TopNav } from '@/components/TopNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-7xl p-6">{children}</main>
    </>
  );
}
