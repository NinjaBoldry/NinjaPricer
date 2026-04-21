import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/mcp/auth', () => ({
  authenticateMcpRequest: vi.fn().mockResolvedValue({
    user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
    token: { id: 't1', label: 'x', ownerUserId: 'u1' },
  }),
}));
vi.mock('@/lib/services/product', () => ({
  listProducts: vi.fn(async () => [
    { id: 'p1', name: 'Ninja Notes', kind: 'SAAS_USAGE', isArchived: false },
  ]),
  getProductById: vi.fn(),
}));
vi.mock('@/lib/services/bundle', () => ({
  listBundles: vi.fn(async () => []),
  getBundleById: vi.fn(),
}));
vi.mock('@/lib/services/scenario', () => ({
  listScenariosForUser: vi.fn(async () => []),
  getScenarioById: vi.fn(),
}));
vi.mock('@/lib/db/repositories/quote', () => ({
  QuoteRepository: vi.fn(function (this: Record<string, unknown>) {
    this.listByScenario = vi.fn(async () => []);
    this.findById = vi.fn();
    return this;
  }),
}));
vi.mock('@/lib/services/employee', () => ({
  listEmployees: vi.fn(async () => []),
  getEmployeeById: vi.fn(),
}));
vi.mock('@/lib/services/department', () => ({
  listDepartmentsWithLoadedRate: vi.fn(async () => []),
}));
vi.mock('@/lib/services/burden', () => ({
  listBurdens: vi.fn(async () => []),
}));
vi.mock('@/lib/services/commissionRule', () => ({
  listCommissionRules: vi.fn(async () => []),
  getCommissionRuleById: vi.fn(),
}));
vi.mock('@/lib/services/apiToken', () => ({
  listAllApiTokens: vi.fn(async () => []),
  verifyApiToken: vi.fn(),
}));

import { POST } from './route';
import { authenticateMcpRequest } from '@/lib/mcp/auth';

function rpc(id: number, method: string, params: unknown = {}) {
  return new Request('http://x/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer np_live_x' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
}

describe('MCP protocol conformance', () => {
  it('initialize returns protocolVersion and tools capability', async () => {
    const res = await POST(rpc(1, 'initialize', {}));
    const body = await res.json();
    expect(body.result.protocolVersion).toBeDefined();
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it('tools/list returns expected read tools for admin', async () => {
    const res = await POST(rpc(2, 'tools/list'));
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('list_products');
    expect(names).toContain('compute_quote');
    expect(names).toContain('list_api_tokens');
  });

  it('tools/call list_products returns the mocked product list wrapped in content[]', async () => {
    const res = await POST(rpc(3, 'tools/call', { name: 'list_products', arguments: {} }));
    const body = await res.json();
    expect(body.result.content[0].type).toBe('json');
    expect(body.result.content[0].json[0].name).toBe('Ninja Notes');
  });

  it('tools/call with unknown name returns Forbidden error (do not leak existence)', async () => {
    const res = await POST(rpc(4, 'tools/call', { name: 'nope', arguments: {} }));
    const body = await res.json();
    expect(body.error.code).toBe(-32002);
  });
});

describe('Phase 5.2 catalog tools protocol conformance', () => {
  it('admin sees all 42 catalog-write tools in tools/list', async () => {
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      user: { id: 'u1', email: 'a', name: null, role: 'ADMIN' },
      token: { id: 't1', label: 'x', ownerUserId: 'u1' },
    });
    const res = await POST(rpc(100, 'tools/list'));
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    const expected = [
      'create_product', 'update_product', 'delete_product',
      'create_vendor_rate', 'update_vendor_rate', 'delete_vendor_rate',
      'set_base_usage', 'set_other_variable',
      'create_persona', 'update_persona', 'delete_persona',
      'create_fixed_cost', 'update_fixed_cost', 'delete_fixed_cost',
      'set_product_scale', 'set_list_price',
      'set_volume_tiers', 'set_contract_modifiers',
      'create_labor_sku', 'update_labor_sku', 'delete_labor_sku',
      'create_department', 'update_department', 'delete_department',
      'set_department_bill_rate',
      'create_employee', 'update_employee', 'delete_employee',
      'create_burden', 'update_burden', 'delete_burden',
      'create_commission_rule', 'update_commission_rule', 'delete_commission_rule',
      'set_commission_tiers',
      'create_bundle', 'update_bundle', 'delete_bundle', 'set_bundle_items',
      'create_rail', 'update_rail', 'delete_rail',
    ];
    for (const name of expected) {
      expect(names).toContain(name);
    }
  });

  it('sales sees NONE of the catalog-write tools', async () => {
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      user: { id: 'u2', email: 's', name: null, role: 'SALES' },
      token: { id: 't2', label: 'y', ownerUserId: 'u2' },
    });
    const res = await POST(rpc(101, 'tools/list'));
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    const forbidden = ['create_product', 'set_commission_tiers', 'delete_employee'];
    for (const name of forbidden) {
      expect(names).not.toContain(name);
    }
  });

  it('sales calling a catalog tool gets -32002 Forbidden', async () => {
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      user: { id: 'u2', email: 's', name: null, role: 'SALES' },
      token: { id: 't2', label: 'y', ownerUserId: 'u2' },
    });
    const res = await POST(
      rpc(102, 'tools/call', { name: 'create_product', arguments: { name: 'X', kind: 'SAAS_USAGE' } }),
    );
    const body = await res.json();
    expect(body.error.code).toBe(-32002);
  });
});
