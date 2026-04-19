import type { PrismaClient, User, Role } from '@prisma/client';

export class UserRepository {
  constructor(private db: PrismaClient) {}

  async findAll(): Promise<Pick<User, 'id' | 'email' | 'name' | 'role' | 'createdAt'>[]> {
    return this.db.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { email: 'asc' },
    });
  }

  async findById(id: string): Promise<Pick<User, 'id' | 'email' | 'name' | 'role'> | null> {
    return this.db.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true },
    });
  }

  async findByEmail(email: string): Promise<Pick<User, 'id' | 'email' | 'role'> | null> {
    return this.db.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true },
    });
  }

  async create(data: { email: string; name: string; role: Role }): Promise<Pick<User, 'id' | 'email' | 'name' | 'role'>> {
    return this.db.user.create({
      data,
      select: { id: true, email: true, name: true, role: true },
    });
  }

  async setRole(id: string, role: Role): Promise<Pick<User, 'id' | 'role'>> {
    return this.db.user.update({
      where: { id },
      data: { role },
      select: { id: true, role: true },
    });
  }
}
