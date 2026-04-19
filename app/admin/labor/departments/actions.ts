'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { DepartmentRepository } from '@/lib/db/repositories/department';
import { DepartmentService } from '@/lib/services/department';
import { ValidationError } from '@/lib/utils/errors';

export async function createDepartment(formData: FormData) {
  const service = new DepartmentService(new DepartmentRepository(prisma));
  let errorMsg: string | null = null;
  try {
    await service.create({ name: formData.get('name') as string });
  } catch (e) {
    if (e instanceof ValidationError) errorMsg = e.message;
    else throw e;
  }
  if (errorMsg) redirect(`/admin/labor/departments?error=${encodeURIComponent(errorMsg)}`);
  redirect('/admin/labor/departments');
}
