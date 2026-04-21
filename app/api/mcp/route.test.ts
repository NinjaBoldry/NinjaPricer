import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/mcp/auth', () => ({
  authenticateMcpRequest: vi.fn(),
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
  it('returns JSON-RPC 401 wrapper on UnauthorizedError', async () => {
    vi.mocked(authenticateMcpRequest).mockRejectedValue(new UnauthorizedError('nope'));
    const res = await POST(jsonRpcReq('tools/list'));
    expect(res.status).toBe(200);
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
