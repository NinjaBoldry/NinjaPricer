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
    const targetEntityId =
      tool.extractTargetId?.(input, output as O | undefined) ?? undefined;
    const audit: Parameters<typeof appendAudit>[0] = {
      tokenId: ctx.token.id,
      userId: ctx.user.id,
      toolName: tool.name,
      args: input,
      result: errored ? 'ERROR' : 'OK',
    };
    if (tool.targetEntityType) audit.targetEntityType = tool.targetEntityType;
    audit.targetEntityId = targetEntityId;
    if (errored) {
      audit.errorCode = errored instanceof Error ? errored.name : 'Unknown';
    }
    // Fire-and-forget: a failed audit write shouldn't clobber the tool result.
    try {
      const p = appendAudit(audit);
      if (p && typeof (p as unknown as Promise<unknown>).catch === 'function') {
        void (p as unknown as Promise<unknown>).catch(() => {});
      }
    } catch {
      // swallow
    }
  }
}
