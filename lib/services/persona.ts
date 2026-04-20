import { z } from 'zod';
import Decimal from 'decimal.js';
import { ValidationError } from '../utils/errors';

export interface IPersonaRepository {
  upsert(data: {
    productId: string;
    name: string;
    multiplier: Decimal;
    sortOrder: number;
  }): Promise<unknown>;
  findByProduct(productId: string): Promise<unknown[]>;
  delete(id: string): Promise<void>;
}

const UpsertPersonaSchema = z.object({
  productId: z.string().min(1, 'is required'),
  name: z.string().min(1, 'is required'),
  multiplier: z.instanceof(Decimal),
  sortOrder: z.number().int().min(0),
});

export class PersonaService {
  constructor(private repo: IPersonaRepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertPersonaSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'persona', issue.message);
    }
    if (parsed.data.multiplier.lte(0)) {
      throw new ValidationError('multiplier', 'must be > 0');
    }
    return this.repo.upsert(parsed.data);
  }

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }

  async delete(id: string) {
    return this.repo.delete(id);
  }
}
