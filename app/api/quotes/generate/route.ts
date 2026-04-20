import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  await requireAuth();

  const body = (await req.json()) as { scenarioId?: string };
  const scenarioId = body?.scenarioId;

  if (!scenarioId) {
    return NextResponse.json({ error: 'scenarioId required' }, { status: 400 });
  }

  return NextResponse.json(
    { message: 'Quote generation is not yet implemented', scenarioId },
    { status: 202 },
  );
}
