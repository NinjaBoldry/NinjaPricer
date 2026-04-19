import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export type UserRole = 'ADMIN' | 'SALES';

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export async function getSessionUser(): Promise<AuthedUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  const u = session.user;
  if (!u.id || !u.email) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? u.email,
    role: u.role ?? 'SALES',
  };
}

export async function requireAuth(): Promise<AuthedUser> {
  const user = await getSessionUser();
  if (!user) redirect('/api/auth/signin');
  return user;
}

export async function requireAdmin(): Promise<AuthedUser> {
  const user = await requireAuth();
  if (user.role !== 'ADMIN') redirect('/scenarios');
  return user;
}
