import { z } from 'zod';
import { Role } from '@prisma/client';
import { ValidationError } from '../utils/errors';

export interface IUserRepository {
  findAll(): Promise<unknown[]>;
  findById(id: string): Promise<unknown>;
  findByEmail(email: string): Promise<unknown>;
  create(data: { email: string; name: string; role: Role }): Promise<unknown>;
  setRole(id: string, role: Role): Promise<unknown>;
}

const SetRoleSchema = z.object({
  userId: z.string().min(1, 'is required'),
  role: z.nativeEnum(Role),
  actingUserId: z.string().min(1, 'is required'),
});

const InviteSchema = z.object({
  email: z.string().email('must be a valid email'),
  role: z.nativeEnum(Role),
});

export class UserService {
  constructor(private repo: IUserRepository) {}

  async listAll() { return this.repo.findAll(); }
  async findById(id: string) { return this.repo.findById(id); }

  async setRole(userId: string, role: Role, actingUserId: string) {
    const parsed = SetRoleSchema.safeParse({ userId, role, actingUserId });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'user', issue.message);
    }
    if (parsed.data.userId === parsed.data.actingUserId && parsed.data.role !== 'ADMIN') {
      throw new ValidationError('role', 'cannot remove your own ADMIN role');
    }
    return this.repo.setRole(parsed.data.userId, parsed.data.role);
  }

  async invite(email: string, role: Role, allowedDomain: string) {
    const normalised = email.trim().toLowerCase();
    const parsed = InviteSchema.safeParse({ email: normalised, role });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'user', issue.message);
    }
    if (allowedDomain && !normalised.endsWith(`@${allowedDomain.toLowerCase()}`)) {
      throw new ValidationError('email', `must be from @${allowedDomain}`);
    }
    const existing = await this.repo.findByEmail(normalised);
    if (existing) {
      throw new ValidationError('email', 'a user with this email already exists');
    }
    const name = normalised.split('@')[0] ?? normalised;
    return this.repo.create({ email: normalised, name, role: parsed.data.role });
  }
}
