import { z } from 'zod';
import { CommissionScopeType, CommissionBaseMetric } from '@prisma/client';
import { ValidationError } from '../utils/errors';

export interface ICommissionRuleRepository {
  create(data: {
    name: string;
    scopeType: CommissionScopeType;
    baseMetric: CommissionBaseMetric;
    scopeProductId?: string | undefined;
    scopeDepartmentId?: string | undefined;
    recipientEmployeeId?: string | undefined;
    notes?: string | undefined;
  }): Promise<unknown>;
  findAll(): Promise<unknown[]>;
  findById(id: string): Promise<unknown>;
  update(
    id: string,
    data: {
      name?: string | undefined;
      scopeType?: CommissionScopeType | undefined;
      baseMetric?: CommissionBaseMetric | undefined;
      scopeProductId?: string | null | undefined;
      scopeDepartmentId?: string | null | undefined;
      recipientEmployeeId?: string | null | undefined;
      notes?: string | null | undefined;
      isActive?: boolean | undefined;
    },
  ): Promise<unknown>;
}

const CreateRuleSchema = z.object({
  name: z.string().min(1, 'is required'),
  scopeType: z.nativeEnum(CommissionScopeType),
  baseMetric: z.nativeEnum(CommissionBaseMetric),
  scopeProductId: z.string().optional(),
  scopeDepartmentId: z.string().optional(),
  recipientEmployeeId: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateRuleSchema = z.object({
  name: z.string().min(1, 'is required').optional(),
  scopeType: z.nativeEnum(CommissionScopeType).optional(),
  baseMetric: z.nativeEnum(CommissionBaseMetric).optional(),
  scopeProductId: z.string().nullable().optional(),
  scopeDepartmentId: z.string().nullable().optional(),
  recipientEmployeeId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

function validateScope(data: {
  scopeType: CommissionScopeType;
  baseMetric: CommissionBaseMetric;
  scopeProductId?: string | undefined;
  scopeDepartmentId?: string | undefined;
}) {
  if (data.scopeType === 'PRODUCT' && !data.scopeProductId) {
    throw new ValidationError('scopeProductId', 'is required when scope is PRODUCT');
  }
  if (data.scopeType === 'DEPARTMENT' && !data.scopeDepartmentId) {
    throw new ValidationError('scopeDepartmentId', 'is required when scope is DEPARTMENT');
  }
  if (
    (data.baseMetric === 'TAB_REVENUE' || data.baseMetric === 'TAB_MARGIN') &&
    !data.scopeProductId
  ) {
    throw new ValidationError(
      'scopeProductId',
      `is required when baseMetric is ${data.baseMetric}`,
    );
  }
}

export class CommissionRuleService {
  constructor(private repo: ICommissionRuleRepository) {}

  async create(data: unknown) {
    const parsed = CreateRuleSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'commissionRule', issue.message);
    }
    validateScope(parsed.data);
    return this.repo.create(parsed.data);
  }

  async findAll() {
    return this.repo.findAll();
  }
  async findById(id: string) {
    return this.repo.findById(id);
  }

  async update(id: string, data: unknown) {
    const parsed = UpdateRuleSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new ValidationError(issue.path.join('.') || 'commissionRule', issue.message);
    }
    const current = (await this.repo.findById(id)) as {
      scopeType: string;
      baseMetric: string;
      scopeProductId: string | null;
      scopeDepartmentId: string | null;
    } | null;
    if (!current) {
      throw new ValidationError('commissionRule', 'not found');
    }
    const merged = {
      scopeType: (parsed.data.scopeType ?? current.scopeType) as CommissionScopeType,
      baseMetric: (parsed.data.baseMetric ?? current.baseMetric) as CommissionBaseMetric,
      scopeProductId:
        parsed.data.scopeProductId !== undefined
          ? (parsed.data.scopeProductId ?? undefined)
          : (current.scopeProductId ?? undefined),
      scopeDepartmentId:
        parsed.data.scopeDepartmentId !== undefined
          ? (parsed.data.scopeDepartmentId ?? undefined)
          : (current.scopeDepartmentId ?? undefined),
    };
    validateScope(merged);
    return this.repo.update(id, parsed.data);
  }
}
