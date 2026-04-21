import type { z } from 'zod';
import { ForbiddenError } from './errors';
import type { McpContext } from './context';

export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  requiresAdmin: boolean;
  handler: (ctx: McpContext, input: I) => Promise<O>;
}

export interface McpServer {
  listTools(ctx: McpContext): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  callTool(name: string, rawInput: unknown, ctx: McpContext): Promise<unknown>;
}

export function createMcpServer(tools: ToolDefinition[]): McpServer {
  const byName = new Map(tools.map((t) => [t.name, t]));

  function visibleTools(ctx: McpContext): ToolDefinition[] {
    return tools.filter((t) => !t.requiresAdmin || ctx.user.role === 'ADMIN');
  }

  function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
    // Placeholder JSON Schema shape. The @modelcontextprotocol/sdk's higher-level
    // tools accept Zod schemas directly; this function is only used when we need a
    // plain JSON Schema for debugging tests. The real wire-encoding is owned by
    // the SDK transport in app/api/mcp/route.ts.
    return { $zod: schema.description ?? 'ZodType' };
  }

  return {
    listTools(ctx) {
      return visibleTools(ctx).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(t.inputSchema),
      }));
    },
    async callTool(name, rawInput, ctx) {
      const tool = byName.get(name);
      if (!tool) throw new ForbiddenError(`Unknown tool: ${name}`);
      if (tool.requiresAdmin && ctx.user.role !== 'ADMIN') {
        throw new ForbiddenError(`Forbidden: admin role required for ${name}`);
      }
      const parsed = tool.inputSchema.parse(rawInput);
      return tool.handler(ctx, parsed);
    },
  };
}
