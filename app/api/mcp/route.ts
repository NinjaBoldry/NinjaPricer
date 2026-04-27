import { NextResponse } from 'next/server';
import { authenticateMcpRequest } from '@/lib/mcp/auth';
import { createMcpServer } from '@/lib/mcp/server';
import { toMcpError } from '@/lib/mcp/errors';
import { resolvePublicOrigin } from '@/lib/oauth/metadata';
import { readTools } from '@/lib/mcp/tools/reads';
import { adminReadTools } from '@/lib/mcp/tools/adminReads';
import { scenarioWriteTools } from '@/lib/mcp/tools/scenarioWrites';
import { productCatalogTools } from '@/lib/mcp/tools/catalog/product';
import { meteredPricingTools } from '@/lib/mcp/tools/catalog/meteredPricing';
import { saasRateCardTools } from '@/lib/mcp/tools/catalog/saasRateCard';
import { laborTools } from '@/lib/mcp/tools/catalog/labor';
import { commissionTools } from '@/lib/mcp/tools/catalog/commissions';
import { bundleTools } from '@/lib/mcp/tools/catalog/bundles';
import { railTools } from '@/lib/mcp/tools/catalog/rails';
import { hubspotCatalogTools } from '@/lib/mcp/tools/hubspot';
import type { ToolDefinition } from '@/lib/mcp/server';
import {
  linkScenarioToHubspotDealTool,
  createHubspotDealForScenarioTool,
  publishScenarioToHubspotTool,
  checkPublishStatusTool,
  supersedeHubspotQuoteTool,
} from '@/lib/mcp/tools/hubspotQuote';

const hubspotQuoteTools = [
  linkScenarioToHubspotDealTool,
  createHubspotDealForScenarioTool,
  publishScenarioToHubspotTool,
  checkPublishStatusTool,
  supersedeHubspotQuoteTool,
] as ToolDefinition<unknown, unknown>[];

const tools: Parameters<typeof createMcpServer>[0] = [
  ...readTools,
  ...adminReadTools,
  ...scenarioWriteTools,
  ...productCatalogTools,
  ...meteredPricingTools,
  ...saasRateCardTools,
  ...laborTools,
  ...commissionTools,
  ...bundleTools,
  ...railTools,
  ...hubspotCatalogTools,
  ...hubspotQuoteTools,
];

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

// Per the MCP authorization spec, an unauthenticated request must include a
// WWW-Authenticate header pointing at the resource metadata so OAuth-aware clients
// (Cowork, Claude Desktop) can discover where to authenticate. We additionally
// return the JSON-RPC error body so existing direct-API clients see a sensible
// payload, but they only need the body, not the header.
function rpcUnauthorized(id: JsonRpcEnvelope['id'], request: Request, message: string) {
  const origin = resolvePublicOrigin(request);
  return NextResponse.json(
    { jsonrpc: '2.0', id, error: { code: -32001, message } },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': `Bearer realm="ninja-pricer", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    },
  );
}

export async function POST(request: Request) {
  let env: JsonRpcEnvelope;
  try {
    env = (await request.json()) as JsonRpcEnvelope;
  } catch {
    return rpcErr(null, -32700, 'Parse error');
  }

  let ctx;
  try {
    ctx = await authenticateMcpRequest(request);
  } catch (err) {
    const mapped = toMcpError(err);
    if (mapped.code === -32001) {
      return rpcUnauthorized(env.id ?? null, request, mapped.message);
    }
    return rpcErr(env.id ?? null, mapped.code, mapped.message, mapped.data);
  }

  try {
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
    if (mapped.code === -32603) {
      console.error('[mcp] unhandled error:', err);
    }
    return rpcErr(env.id ?? null, mapped.code, mapped.message, mapped.data);
  }
}
