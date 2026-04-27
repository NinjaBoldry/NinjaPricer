import { NextResponse } from 'next/server';
import { buildProtectedResourceMetadata, resolvePublicOrigin } from '@/lib/oauth/metadata';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const origin = resolvePublicOrigin(request);
  return NextResponse.json(buildProtectedResourceMetadata(origin), {
    headers: {
      // Allow MCP clients to discover this from any origin.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
