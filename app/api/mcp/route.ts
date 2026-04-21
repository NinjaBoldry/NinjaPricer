import { NextResponse } from 'next/server';
import { authenticateMcpRequest } from '@/lib/mcp/auth';
import { createMcpServer } from '@/lib/mcp/server';
import { toMcpError } from '@/lib/mcp/errors';
import { readTools } from '@/lib/mcp/tools/reads';

// Tools are registered here. 5.0-K onward will add to this list.
const tools: Parameters<typeof createMcpServer>[0] = [...readTools];

const server = createMcpServer(tools);

interface JsonRpcEnvelope {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
}

function rpcOk(id: JsonRpcEnvelope['id'], result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result });
}

function rpcErr(id: JsonRpcEnvelope['id'], code: number, message: string, data?: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message, data } });
}

export async function POST(request: Request) {
  let env: JsonRpcEnvelope;
  try {
    env = (await request.json()) as JsonRpcEnvelope;
  } catch {
    return rpcErr(null, -32700, 'Parse error');
  }

  try {
    const ctx = await authenticateMcpRequest(request);

    if (env.method === 'initialize') {
      return rpcOk(env.id, {
        protocolVersion: '2025-03-26',
        serverInfo: { name: 'ninja-pricer', version: '0.1.0' },
        capabilities: { tools: {} },
      });
    }

    if (env.method === 'tools/list') {
      return rpcOk(env.id, { tools: server.listTools(ctx) });
    }

    if (env.method === 'tools/call') {
      const params = (env.params ?? {}) as { name?: string; arguments?: unknown };
      if (typeof params.name !== 'string') {
        return rpcErr(env.id, -32602, 'Invalid params: name required');
      }
      const out = await server.callTool(params.name, params.arguments ?? {}, ctx);
      return rpcOk(env.id, { content: [{ type: 'json', json: out }] });
    }

    return rpcErr(env.id, -32601, `Method not found: ${env.method}`);
  } catch (err) {
    const mapped = toMcpError(err);
    return rpcErr(env.id ?? null, mapped.code, mapped.message, mapped.data);
  }
}
