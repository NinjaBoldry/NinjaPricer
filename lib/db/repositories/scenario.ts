import type {
  PrismaClient,
  Scenario,
  ScenarioSaaSConfig,
  ScenarioLaborLine,
  ScenarioStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

type ScenarioRow = Pick<
  Scenario,
  | 'id'
  | 'name'
  | 'customerName'
  | 'ownerId'
  | 'contractMonths'
  | 'appliedBundleId'
  | 'notes'
  | 'status'
  | 'isArchived'
  | 'createdAt'
  | 'updatedAt'
>;

const scenarioSelect = {
  id: true,
  name: true,
  customerName: true,
  ownerId: true,
  contractMonths: true,
  appliedBundleId: true,
  notes: true,
  status: true,
  isArchived: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SaaSConfigRow = Pick<
  ScenarioSaaSConfig,
  'id' | 'productId' | 'seatCount' | 'personaMix' | 'discountOverridePct'
>;

type LaborLineRow = Pick<
  ScenarioLaborLine,
  | 'id'
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

type ScenarioWithRelations = ScenarioRow & {
  saasConfigs: SaaSConfigRow[];
  laborLines: LaborLineRow[];
};

type ArchiveRow = Pick<Scenario, 'id' | 'status' | 'isArchived'>;

export class ScenarioRepository {
  constructor(private db: PrismaClient) {}

  async create(data: {
    name: string;
    customerName: string;
    ownerId: string;
    contractMonths: number;
    notes?: string;
  }): Promise<ScenarioRow> {
    return this.db.scenario.create({
      data: {
        ...data,
        status: 'DRAFT',
        isArchived: false,
      },
      select: scenarioSelect,
    });
  }

  async findById(id: string): Promise<ScenarioWithRelations | null> {
    return this.db.scenario.findUnique({
      where: { id },
      select: {
        ...scenarioSelect,
        saasConfigs: {
          select: {
            id: true,
            productId: true,
            seatCount: true,
            personaMix: true,
            discountOverridePct: true,
          },
        },
        laborLines: {
          select: {
            id: true,
            productId: true,
            skuId: true,
            departmentId: true,
            customDescription: true,
            qty: true,
            unit: true,
            costPerUnitUsd: true,
            revenuePerUnitUsd: true,
            sortOrder: true,
          },
        },
      },
    });
  }

  async listWithFilters(params: {
    actingUser: { id: string; role: 'ADMIN' | 'SALES' };
    customerName?: string;
    status?: ScenarioStatus;
  }): Promise<ScenarioRow[]> {
    const { actingUser, customerName, status } = params;

    const where: Prisma.ScenarioWhereInput = {
      isArchived: false,
      ...(actingUser.role === 'SALES' && { ownerId: actingUser.id }),
      ...(customerName !== undefined && {
        customerName: { contains: customerName, mode: 'insensitive' },
      }),
      ...(status !== undefined && { status }),
    };

    return this.db.scenario.findMany({
      where,
      select: scenarioSelect,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      customerName: string;
      contractMonths: number;
      notes: string | null;
      appliedBundleId: string | null;
      status: ScenarioStatus;
    }>,
  ): Promise<ScenarioRow> {
    return this.db.scenario.update({
      where: { id },
      data,
      select: scenarioSelect,
    });
  }

  async archive(id: string): Promise<ArchiveRow> {
    return this.db.scenario.update({
      where: { id },
      data: { isArchived: true, status: 'ARCHIVED' },
      select: { id: true, status: true, isArchived: true },
    });
  }
}
