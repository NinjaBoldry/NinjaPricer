import { describe, it, expect, vi } from 'vitest';
import { CommissionRuleService } from './commissionRule';
import { ValidationError } from '../utils/errors';
import { mockCommissionRuleRepo } from '../db/repositories/__mocks__/commissionRule';

const validAllRevenue = {
  name: 'Total Revenue Commission',
  scopeType: 'ALL' as const,
  baseMetric: 'REVENUE' as const,
};

const validProductTabRevenue = {
  name: 'Notes Tab Commission',
  scopeType: 'PRODUCT' as const,
  baseMetric: 'TAB_REVENUE' as const,
  scopeProductId: 'prod1',
};

describe('CommissionRuleService.create', () => {
  it('accepts ALL scope with REVENUE metric', async () => {
    const repo = mockCommissionRuleRepo();
    const service = new CommissionRuleService(repo);
    await expect(service.create(validAllRevenue)).resolves.toBeDefined();
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('accepts PRODUCT scope with TAB_REVENUE metric and scopeProductId', async () => {
    const repo = mockCommissionRuleRepo();
    const service = new CommissionRuleService(repo);
    await expect(service.create(validProductTabRevenue)).resolves.toBeDefined();
  });

  it('accepts DEPARTMENT scope with CONTRIBUTION_MARGIN metric and scopeDepartmentId', async () => {
    const repo = mockCommissionRuleRepo();
    const service = new CommissionRuleService(repo);
    await expect(
      service.create({
        name: 'Eng Dept Commission',
        scopeType: 'DEPARTMENT',
        baseMetric: 'CONTRIBUTION_MARGIN',
        scopeDepartmentId: 'dept1',
      })
    ).resolves.toBeDefined();
  });

  it('throws when name is empty', async () => {
    const service = new CommissionRuleService(mockCommissionRuleRepo());
    await expect(service.create({ ...validAllRevenue, name: '' })).rejects.toMatchObject({ field: 'name' });
  });

  it('throws when PRODUCT scope is missing scopeProductId', async () => {
    const service = new CommissionRuleService(mockCommissionRuleRepo());
    await expect(
      service.create({ name: 'Test', scopeType: 'PRODUCT', baseMetric: 'REVENUE' })
    ).rejects.toMatchObject({ field: 'scopeProductId' });
  });

  it('throws when DEPARTMENT scope is missing scopeDepartmentId', async () => {
    const service = new CommissionRuleService(mockCommissionRuleRepo());
    await expect(
      service.create({ name: 'Test', scopeType: 'DEPARTMENT', baseMetric: 'REVENUE' })
    ).rejects.toMatchObject({ field: 'scopeDepartmentId' });
  });

  it('throws when TAB_REVENUE is missing scopeProductId even on ALL scope', async () => {
    const service = new CommissionRuleService(mockCommissionRuleRepo());
    await expect(
      service.create({ name: 'Test', scopeType: 'ALL', baseMetric: 'TAB_REVENUE' })
    ).rejects.toMatchObject({ field: 'scopeProductId' });
  });

  it('throws when TAB_MARGIN is missing scopeProductId', async () => {
    const service = new CommissionRuleService(mockCommissionRuleRepo());
    await expect(
      service.create({ name: 'Test', scopeType: 'ALL', baseMetric: 'TAB_MARGIN' })
    ).rejects.toMatchObject({ field: 'scopeProductId' });
  });
});

describe('CommissionRuleService.update', () => {
  it('updates name-only without triggering scope validation', async () => {
    const repo = mockCommissionRuleRepo();
    // mock findById to return a PRODUCT-scoped rule with scopeProductId set
    repo.findById = vi.fn().mockResolvedValue({
      id: 'cr1',
      name: 'Old Name',
      scopeType: 'PRODUCT',
      baseMetric: 'REVENUE',
      scopeProductId: 'prod1',
      scopeDepartmentId: null,
    });
    const service = new CommissionRuleService(repo);
    await expect(service.update('cr1', { name: 'New Name' })).resolves.toBeDefined();
    expect(repo.update).toHaveBeenCalledOnce();
  });

  it('throws when patching scopeType to PRODUCT without scopeProductId on the merged row', async () => {
    const repo = mockCommissionRuleRepo();
    repo.findById = vi.fn().mockResolvedValue({
      id: 'cr1',
      name: 'Test',
      scopeType: 'ALL',
      baseMetric: 'REVENUE',
      scopeProductId: null,
      scopeDepartmentId: null,
    });
    const service = new CommissionRuleService(repo);
    await expect(service.update('cr1', { scopeType: 'PRODUCT' })).rejects.toMatchObject({ field: 'scopeProductId' });
  });

  it('throws when patching baseMetric to TAB_REVENUE without scopeProductId on the merged row', async () => {
    const repo = mockCommissionRuleRepo();
    repo.findById = vi.fn().mockResolvedValue({
      id: 'cr1',
      name: 'Test',
      scopeType: 'ALL',
      baseMetric: 'REVENUE',
      scopeProductId: null,
      scopeDepartmentId: null,
    });
    const service = new CommissionRuleService(repo);
    await expect(service.update('cr1', { baseMetric: 'TAB_REVENUE' })).rejects.toMatchObject({ field: 'scopeProductId' });
  });

  it('throws when rule is not found', async () => {
    const repo = mockCommissionRuleRepo();
    repo.findById = vi.fn().mockResolvedValue(null);
    const service = new CommissionRuleService(repo);
    await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow(ValidationError);
  });
});

describe('CommissionRuleService.findAll / findById', () => {
  it('findAll delegates to repo', async () => {
    const repo = mockCommissionRuleRepo();
    repo.findAll = vi.fn().mockResolvedValue([{ id: 'cr1', name: 'Test' }]);
    const service = new CommissionRuleService(repo);
    const result = await service.findAll();
    expect(result).toHaveLength(1);
    expect(repo.findAll).toHaveBeenCalledOnce();
  });

  it('findById delegates to repo', async () => {
    const repo = mockCommissionRuleRepo();
    repo.findById = vi.fn().mockResolvedValue({ id: 'cr1', name: 'Test' });
    const service = new CommissionRuleService(repo);
    const result = await service.findById('cr1');
    expect(result).toBeDefined();
    expect(repo.findById).toHaveBeenCalledWith('cr1');
  });
});
