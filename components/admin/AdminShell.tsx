import AdminSidebar from './AdminSidebar';

export default function AdminShell({
  children,
  currentPath,
}: {
  children: React.ReactNode;
  currentPath: string;
}) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <AdminSidebar currentPath={currentPath} />
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
