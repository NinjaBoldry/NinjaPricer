import { z } from 'zod';
import { ValidationError } from '../utils/errors';

export interface IProductScaleRepository {
  upsert(data: { productId: string; activeUsersAtScale: number }): Promise<unknown>;
  findByProduct(productId: string): Promise<unknown>;
}

const UpsertProductScaleSchema = z.object({
  productId: z.string().min(1, 'is required'),
  activeUsersAtScale: z.number().int().positive(),
});

export class ProductScaleService {
  constructor(private repo: IProductScaleRepository) {}

  async upsert(data: unknown) {
    const parsed = UpsertProductScaleSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'productScale', issue.message);
    }
    return this.repo.upsert(parsed.data);
  }

  async findByProduct(productId: string) {
    return this.repo.findByProduct(productId);
  }
}
