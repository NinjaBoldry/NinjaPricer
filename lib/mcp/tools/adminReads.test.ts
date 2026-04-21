import { describe, it, expect, vi } from 'vitest';
import type { McpContext } from '@/lib/mcp/context';

vi.mock('@/lib/services/employee', () => ({
  listEmployees: vi.fn(async () => []),
  getEmployeeById: vi.fn(async () => ({ id: 'e1' })),
}));
vi.mock('@/lib/services/department', () => ({
  listDepartmentsWithLoadedRate: vi.fn(async () => []),
}));
vi.mock('@/lib/services/burden', () => ({
  listBurdens: vi.fn(async () => []),
}));
vi.mock('@/lib/services/commissionRule', () => ({
  listCommissionRules: vi.fn(async () => []),
  getCommissionRuleById: vi.fn(async () => ({ id: 'r1' })),
}));
vi.mock('@/lib/services/apiToken', () => ({
  listAllApiTokens: vi.fn(async () => []),
}));

import {
  listEmployeesTool,
  getEmployeeTool,
  listDepartmentsTool,
  listBurdensTool,
  listCommissionRulesTool,
  getCommissionRuleTool,
  listApiTokensTool,
} from './adminReads';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};

describe('admin-only read tools all have requiresAdmin=true', () => {
  it.each([
    listEmployeesTool,
    getEmployeeTool,
    listDepartmentsTool,
    listBurdensTool,
    listCommissionRulesTool,
    getCommissionRuleTool,
    listApiTokensTool,
  ])('%s.name has requiresAdmin=true', (tool) => {
    expect(tool.requiresAdmin).toBe(true);
  });
});

describe('admin-only read tools call their services', () => {
  it('list_employees', async () => {
    await listEmployeesTool.handler(adminCtx, {});
    const { listEmployees } = await import('@/lib/services/employee');
    expect(listEmployees).toHaveBeenCalled();
  });

  it('get_employee forwards id', async () => {
    await getEmployeeTool.handler(adminCtx, { id: 'e1' });
    const { getEmployeeById } = await import('@/lib/services/employee');
    expect(getEmployeeById).toHaveBeenCalledWith('e1');
  });

  it('list_departments uses loaded-rate variant', async () => {
    await listDepartmentsTool.handler(adminCtx, {});
    const { listDepartmentsWithLoadedRate } = await import('@/lib/services/department');
    expect(listDepartmentsWithLoadedRate).toHaveBeenCalled();
  });

  it('list_burdens', async () => {
    await listBurdensTool.handler(adminCtx, {});
    const { listBurdens } = await import('@/lib/services/burden');
    expect(listBurdens).toHaveBeenCalled();
  });

  it('list_commission_rules', async () => {
    await listCommissionRulesTool.handler(adminCtx, {});
    const { listCommissionRules } = await import('@/lib/services/commissionRule');
    expect(listCommissionRules).toHaveBeenCalled();
  });

  it('get_commission_rule forwards id', async () => {
    await getCommissionRuleTool.handler(adminCtx, { id: 'r1' });
    const { getCommissionRuleById } = await import('@/lib/services/commissionRule');
    expect(getCommissionRuleById).toHaveBeenCalledWith('r1');
  });

  it('list_api_tokens', async () => {
    await listApiTokensTool.handler(adminCtx, {});
    const { listAllApiTokens } = await import('@/lib/services/apiToken');
    expect(listAllApiTokens).toHaveBeenCalled();
  });
});
