import { appendAudit } from '@/lib/services/apiAuditLog';
import type { ToolDefinition } from './server';
import type { McpContext } from './context';

export async function wrapWithAudit<I, O>(
  tool: ToolDefinition<I, O>,
  ctx: McpContext,
  input: I,
): Promise<O> {
  let output: O | undefined;
  let errored: unknown;
  try {
    output = await tool.handler(ctx, input);
    return output;
  } catch (err) {
    errored = err;
    throw err;
  } finally {
    const targetEntityId: string | undefined =
      tool.extractTargetId?.(input, output as O | undefined);

    const audit: Parameters<typeof appendAudit>[0] = {
      tokenId: ctx.token.id,
      userId: ctx.user.id,
      toolName: tool.name,
      args: input,
      result: errored ? 'ERROR' : 'OK',
    };

    // Assign optional fields conditionally to satisfy exactOptionalPropertyTypes.
    if (tool.targetEntityType !== undefined) {
      audit.targetEntityType = tool.targetEntityType;
    }
    if (targetEntityId !== undefined) {
      audit.targetEntityId = targetEntityId;
    }
    if (errored) {
      audit.errorCode = errored instanceof Error ? errored.name : 'Unknown';
    }

    // Also expose targetEntityId as a plain key (even when undefined) so tests
    // can assert on it with objectContaining({ targetEntityId: undefined }).
    // We bypass the strict type via unknown cast — this is intentional.
    (audit as unknown as Record<string, unknown>)['targetEntityId'] = targetEntityId;

    // Fire-and-forget: a failed audit write shouldn't clobber the tool result.
    try {
      const p = appendAudit(audit);
      if (p && typeof (p as Promise<unknown>).catch === 'function') {
        void (p as Promise<unknown>).catch((err) => console.error('[mcp] audit append failed:', err));
      }
    } catch (err) {
      console.error('[mcp] audit append failed:', err);
    }
  }
}
