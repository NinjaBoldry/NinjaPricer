import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/mcp/auth', () => ({
  authenticateMcpRequest: vi.fn(),
}));

vi.mock('@/lib/mcp/server', () => ({
  createMcpServer: () => ({
    listTools: () => [],
    callTool: vi.fn().mockResolvedValue({ products: [{ id: 'p1', name: 'Test' }] }),
  }),
}));

import { authenticateMcpRequest } from '@/lib/mcp/auth';
import { UnauthorizedError } from '@/lib/mcp/errors';
import { POST } from './route';

function jsonRpcReq(method: string, params: unknown = {}) {
  return new Request('http://x/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer np_live_x' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

describe('POST /api/mcp', () => {
  it('returns 401 with WWW-Authenticate header on UnauthorizedError', async () => {
    vi.mocked(authenticateMcpRequest).mockRejectedValue(new UnauthorizedError('nope'));
    const res = await POST(jsonRpcReq('tools/list'));
    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get('www-authenticate');
    expect(wwwAuth).toMatch(/^Bearer realm=/);
    expect(wwwAuth).toMatch(/resource_metadata=/);
    const body = await res.json();
    expect(body.error.code).toBe(-32001);
  });

  it('returns empty tools/list for an authed request', async () => {
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      user: { id: 'u1', email: 'a', name: null, role: 'ADMIN' },
      token: { id: 't1', label: 'x', ownerUserId: 'u1' },
    });
    const res = await POST(jsonRpcReq('tools/list'));
    const body = await res.json();
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(1);
    expect(Array.isArray(body.result.tools)).toBe(true);
  });

  it('returns spec-compliant text content blocks for tools/call', async () => {
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      user: { id: 'u1', email: 'a', name: null, role: 'ADMIN' },
      token: { id: 't1', label: 'x', ownerUserId: 'u1' },
    });
    const res = await POST(jsonRpcReq('tools/call', { name: 'list_products', arguments: {} }));
    const body = await res.json();
    expect(body.result.content).toHaveLength(1);
    expect(body.result.content[0].type).toBe('text');
    // text must be parseable JSON of the tool's structured output.
    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed.products).toEqual([{ id: 'p1', name: 'Test' }]);
  });

  it('returns Method not found for unknown JSON-RPC method', async () => {
    vi.mocked(authenticateMcpRequest).mockResolvedValue({
      user: { id: 'u1', email: 'a', name: null, role: 'ADMIN' },
      token: { id: 't1', label: 'x', ownerUserId: 'u1' },
    });
    const res = await POST(jsonRpcReq('bogus/method'));
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });
});
