import { describe, it, expect, vi } from 'vitest';
import { createMcpServer, type ToolDefinition } from './server';
import { ForbiddenError } from './errors';
import { z } from 'zod';
import type { McpContext } from './context';

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
      handler: vi.fn(async (_ctx, input: { n: number }) => ({ doubled: input.n * 2 })),
    };
    const server = createMcpServer([typed]);
    await expect(server.callTool('typed', { n: 'x' }, adminCtx)).rejects.toThrow();
    expect(await server.callTool('typed', { n: 3 }, adminCtx)).toEqual({ doubled: 6 });
  });
});
