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
