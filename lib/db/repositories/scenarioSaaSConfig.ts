import type {
  PrismaClient,
  ProductKind,
  SaaSRevenueModel,
  ScenarioSaaSConfig,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

type SaaSConfigRow = Pick<
  ScenarioSaaSConfig,
  | 'id'
  | 'scenarioId'
  | 'productId'
  | 'seatCount'
  | 'personaMix'
  | 'discountOverridePct'
  | 'committedUnitsPerMonth'
  | 'expectedActualUnitsPerMonth'
>;

const saasConfigSelect = {
  id: true,
  scenarioId: true,
  productId: true,
  seatCount: true,
  personaMix: true,
  discountOverridePct: true,
  committedUnitsPerMonth: true,
  expectedActualUnitsPerMonth: true,
} as const;

export class ScenarioSaaSConfigRepository {
  constructor(private db: PrismaClient) {}

  async findProductRevenueInfo(
    productId: string,
  ): Promise<{ kind: ProductKind; revenueModel: SaaSRevenueModel } | null> {
    return this.db.product.findUnique({
      where: { id: productId },
      select: { kind: true, revenueModel: true },
    });
  }

  async upsert(
    scenarioId: string,
    productId: string,
    data: {
      seatCount: number;
      personaMix: unknown;
      discountOverridePct?: string | null;
      committedUnitsPerMonth?: number | null;
      expectedActualUnitsPerMonth?: number | null;
    },
  ): Promise<SaaSConfigRow> {
    const updateData = {
      seatCount: data.seatCount,
      personaMix: data.personaMix as Prisma.InputJsonValue,
      ...(data.discountOverridePct !== undefined && {
        discountOverridePct: data.discountOverridePct,
      }),
      ...(data.committedUnitsPerMonth !== undefined && {
        committedUnitsPerMonth: data.committedUnitsPerMonth,
      }),
      ...(data.expectedActualUnitsPerMonth !== undefined && {
        expectedActualUnitsPerMonth: data.expectedActualUnitsPerMonth,
      }),
    };

    return this.db.scenarioSaaSConfig.upsert({
      where: { scenarioId_productId: { scenarioId, productId } },
      create: {
        scenarioId,
        productId,
        ...updateData,
      },
      update: updateData,
      select: saasConfigSelect,
    });
  }

  async listByScenarioId(scenarioId: string): Promise<SaaSConfigRow[]> {
    return this.db.scenarioSaaSConfig.findMany({
      where: { scenarioId },
      select: saasConfigSelect,
      orderBy: { productId: 'asc' },
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.scenarioSaaSConfig.delete({
      where: { id },
    });
  }
}
