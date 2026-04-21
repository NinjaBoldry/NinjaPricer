import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/services/apiAuditLog', () => ({
  appendAudit: vi.fn(),
}));

import { appendAudit } from '@/lib/services/apiAuditLog';
import { wrapWithAudit } from './auditWrapper';
import type { ToolDefinition } from './server';
import type { McpContext } from './context';

const ctx: McpContext = {
  user: { id: 'u1', email: 'a@b', name: null, role: 'ADMIN' },
  token: { id: 't1', label: 'x', ownerUserId: 'u1' },
};

describe('wrapWithAudit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('appends OK audit row on success, with extracted target id', async () => {
    const tool: ToolDefinition = {
      name: 'create_scenario',
      description: 'd',
      inputSchema: { parse: (x: unknown) => x } as never,
      requiresAdmin: false,
      isWrite: true,
      targetEntityType: 'Scenario',
      extractTargetId: (_input, output) => (output as { id: string }).id,
      handler: async () => ({ id: 'new_scen_1' }),
    };

    const out = await wrapWithAudit(tool, ctx, { name: 'X' });

    expect(out).toEqual({ id: 'new_scen_1' });
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 't1',
        userId: 'u1',
        toolName: 'create_scenario',
        args: { name: 'X' },
        targetEntityType: 'Scenario',
        targetEntityId: 'new_scen_1',
        result: 'OK',
      }),
    );
  });

  it('appends ERROR audit row when handler throws, preserves the original error', async () => {
    const tool: ToolDefinition = {
      name: 'update_scenario',
      description: 'd',
      inputSchema: { parse: (x: unknown) => x } as never,
      requiresAdmin: false,
      isWrite: true,
      targetEntityType: 'Scenario',
      extractTargetId: (input) => (input as { id: string }).id,
      handler: async () => {
        throw new Error('boom');
      },
    };

    await expect(wrapWithAudit(tool, ctx, { id: 's1' })).rejects.toThrow('boom');
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'update_scenario',
        targetEntityId: 's1',
        result: 'ERROR',
        errorCode: 'Error',
      }),
    );
  });

  it('handles extractTargetId returning undefined (e.g. pre-write errors)', async () => {
    const tool: ToolDefinition = {
      name: 'generate_quote',
      description: 'd',
      inputSchema: { parse: (x: unknown) => x } as never,
      requiresAdmin: false,
      isWrite: true,
      targetEntityType: 'Quote',
      extractTargetId: () => undefined,
      handler: async () => {
        throw new Error('nope');
      },
    };

    await expect(wrapWithAudit(tool, ctx, {})).rejects.toThrow();
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'ERROR',
        targetEntityType: 'Quote',
        targetEntityId: undefined,
      }),
    );
  });
});
