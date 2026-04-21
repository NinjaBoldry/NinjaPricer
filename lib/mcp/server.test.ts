import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMcpServer, type ToolDefinition } from './server';
import { ForbiddenError } from './errors';
import { z } from 'zod';
import type { McpContext } from './context';

vi.mock('@/lib/services/apiAuditLog', () => ({
  appendAudit: vi.fn(),
}));

import { appendAudit } from '@/lib/services/apiAuditLog';

const adminCtx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: 'A', role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};
const salesCtx: McpContext = {
  user: { id: 'u2', email: 's@b', name: 'S', role: 'SALES' },
  token: { id: 't2', label: 'y', ownerUserId: 'u2' },
};

const probe: ToolDefinition = {
  name: 'probe',
  description: 'Returns { ok: true }',
  inputSchema: z.object({}),
  requiresAdmin: false,
  handler: async () => ({ ok: true }),
};

const adminOnly: ToolDefinition = {
  name: 'admin_probe',
  description: 'Admin only. Returns { adminOk: true }',
  inputSchema: z.object({}),
  requiresAdmin: true,
  handler: async () => ({ adminOk: true }),
};

describe('createMcpServer', () => {
  it('listTools returns admin tools only for admin ctx', () => {
    const server = createMcpServer([probe, adminOnly]);
    expect(server.listTools(adminCtx).map((t) => t.name)).toEqual(['probe', 'admin_probe']);
    expect(server.listTools(salesCtx).map((t) => t.name)).toEqual(['probe']);
  });

  it('callTool runs the handler and returns its output', async () => {
    const server = createMcpServer([probe]);
    const out = await server.callTool('probe', {}, adminCtx);
    expect(out).toEqual({ ok: true });
  });

  it('callTool rejects sales caller on admin-only tool with ForbiddenError', async () => {
    const server = createMcpServer([adminOnly]);
    await expect(server.callTool('admin_probe', {}, salesCtx)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('callTool rejects unknown tool name with ForbiddenError (do not leak existence)', async () => {
    const server = createMcpServer([probe]);
    await expect(server.callTool('nope', {}, adminCtx)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('callTool Zod-parses input before invoking handler', async () => {
    const typed: ToolDefinition = {
      name: 'typed',
      description: 'd',
      inputSchema: z.object({ n: z.number() }),
      requiresAdmin: false,
      handler: vi.fn(async (_ctx: McpContext, input: unknown) => {
        const { n } = input as { n: number };
        return { doubled: n * 2 };
      }),
    };
    const server = createMcpServer([typed]);
    await expect(server.callTool('typed', { n: 'x' }, adminCtx)).rejects.toThrow();
    expect(await server.callTool('typed', { n: 3 }, adminCtx)).toEqual({ doubled: 6 });
  });
});

describe('server routes writes through audit wrapper', () => {
  beforeEach(() => vi.clearAllMocks());

  it('isWrite=true tools append OK audit row on success', async () => {
    const write: ToolDefinition = {
      name: 'write_thing',
      description: 'd',
      inputSchema: z.object({}),
      requiresAdmin: false,
      isWrite: true,
      targetEntityType: 'Thing',
      extractTargetId: (_i, o) => (o as { id: string } | undefined)?.id,
      handler: async () => ({ id: 'x1' }),
    };
    const server = createMcpServer([write]);
    await server.callTool('write_thing', {}, adminCtx);
    // wait a microtask for fire-and-forget audit
    await new Promise((r) => setTimeout(r, 0));
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'write_thing', result: 'OK', targetEntityId: 'x1' }),
    );
  });

  it('read tools (isWrite undefined or false) do NOT append audit', async () => {
    const read: ToolDefinition = {
      name: 'read_thing',
      description: 'd',
      inputSchema: z.object({}),
      requiresAdmin: false,
      handler: async () => ({ ok: true }),
    };
    const server = createMcpServer([read]);
    await server.callTool('read_thing', {}, adminCtx);
    await new Promise((r) => setTimeout(r, 0));
    expect(appendAudit).not.toHaveBeenCalled();
  });
});
