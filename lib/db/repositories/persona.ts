import type { PrismaClient, Persona } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export class PersonaRepository {
  constructor(private db: PrismaClient) {}

  async upsert(data: {
    productId: string;
    name: string;
    multiplier: Decimal;
    sortOrder: number;
  }): Promise<Persona> {
    const { productId, name, ...updatePayload } = data;
    return this.db.persona.upsert({
      where: { productId_name: { productId, name } },
      create: data,
      update: updatePayload,
    });
  }

  async create(data: {
    productId: string;
    name: string;
    multiplier: Decimal;
    sortOrder: number;
  }): Promise<Persona> {
    return this.db.persona.create({ data });
  }

  async update(
    id: string,
    patch: Partial<{ name: string; multiplier: Decimal; sortOrder: number }>,
  ): Promise<Persona> {
    return this.db.persona.update({ where: { id }, data: patch });
  }

  async findById(id: string): Promise<Persona | null> {
    return this.db.persona.findUnique({ where: { id } });
  }

  async findByProduct(productId: string): Promise<Persona[]> {
    return this.db.persona.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.persona.delete({ where: { id } });
  }
}
