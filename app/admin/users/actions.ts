'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { UserRepository } from '@/lib/db/repositories/user';
import { UserService } from '@/lib/services/user';
import { requireAdmin } from '@/lib/auth/session';
import { ValidationError } from '@/lib/utils/errors';
import { Role } from '@prisma/client';

function getService() {
  return new UserService(new UserRepository(prisma));
}

export async function inviteUser(formData: FormData) {
  await requireAdmin();
  const service = getService();
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN ?? '';
  let errorMsg: string | null = null;
  try {
    await service.invite(
      formData.get('email') as string,
      formData.get('role') as Role,
      allowedDomain,
    );
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) redirect(`/admin/users?error=${encodeURIComponent(errorMsg)}`);
  redirect('/admin/users');
}

export async function setUserRole(userId: string, formData: FormData) {
  const actingUser = await requireAdmin();
  const service = getService();
  let errorMsg: string | null = null;
  try {
    await service.setRole(userId, formData.get('role') as Role, actingUser.id);
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) redirect(`/admin/users?error=${encodeURIComponent(errorMsg)}`);
  redirect('/admin/users');
}
