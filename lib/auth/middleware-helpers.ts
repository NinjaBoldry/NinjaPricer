export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function userHasAdminRole(user: { role?: string } | null | undefined): boolean {
  return user?.role === 'ADMIN';
}
