import { requireAuth } from '@/lib/auth/session';
import { TopNav } from '@/components/TopNav';

export default async function ScenariosLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-7xl p-6">{children}</main>
    </>
  );
}
