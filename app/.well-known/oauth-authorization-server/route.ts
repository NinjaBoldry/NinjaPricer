import { NextResponse } from 'next/server';
import { buildAuthorizationServerMetadata, resolvePublicOrigin } from '@/lib/oauth/metadata';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const origin = resolvePublicOrigin(request);
  return NextResponse.json(buildAuthorizationServerMetadata(origin), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
