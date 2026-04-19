import { headers } from 'next/headers';
import { TopNav } from '@/components/TopNav';
import AdminShell from '@/components/admin/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const headersList = headers();
  const pathname = headersList.get('x-pathname') ?? '/admin';
  return (
    <>
      <TopNav />
      <AdminShell currentPath={pathname}>{children}</AdminShell>
    </>
  );
}
