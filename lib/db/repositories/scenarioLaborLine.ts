import type { PrismaClient, ScenarioLaborLine } from '@prisma/client';

type LaborLineRow = Pick<
  ScenarioLaborLine,
  | 'id'
  | 'scenarioId'
  | 'productId'
  | 'skuId'
  | 'departmentId'
  | 'customDescription'
  | 'qty'
  | 'unit'
  | 'costPerUnitUsd'
  | 'revenuePerUnitUsd'
  | 'sortOrder'
>;

const laborLineSelect = {
  id: true,
  scenarioId: true,
  productId: true,
  skuId: true,
  departmentId: true,
  customDescription: true,
  qty: true,
  unit: true,
  costPerUnitUsd: true,
  revenuePerUnitUsd: true,
  sortOrder: true,
} as const;

export class ScenarioLaborLineRepository {
  constructor(private db: PrismaClient) {}

  async create(data: {
    scenarioId: string;
    productId: string;
    skuId?: string | null;
    departmentId?: string | null;
    customDescription?: string | null;
    qty: string;
    unit: string;
    costPerUnitUsd: string;
    revenuePerUnitUsd: string;
    sortOrder?: number;
  }): Promise<LaborLineRow> {
    return this.db.scenarioLaborLine.create({
      data: {
        scenarioId: data.scenarioId,
        productId: data.productId,
        qty: data.qty,
        unit: data.unit,
        costPerUnitUsd: data.costPerUnitUsd,
        revenuePerUnitUsd: data.revenuePerUnitUsd,
        ...(data.skuId !== undefined && { skuId: data.skuId }),
        ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
        ...(data.customDescription !== undefined && { customDescription: data.customDescription }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
      select: laborLineSelect,
    });
  }

  async update(
    id: string,
    data: Partial<{
      skuId: string | null;
      departmentId: string | null;
      customDescription: string | null;
      qty: string;
      unit: string;
      costPerUnitUsd: string;
      revenuePerUnitUsd: string;
      sortOrder: number;
    }>,
  ): Promise<LaborLineRow> {
    return this.db.scenarioLaborLine.update({
      where: { id },
      data,
      select: laborLineSelect,
    });
  }

  async listByScenarioId(scenarioId: string): Promise<LaborLineRow[]> {
    return this.db.scenarioLaborLine.findMany({
      where: { scenarioId },
      select: laborLineSelect,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.scenarioLaborLine.delete({
      where: { id },
    });
  }
}
