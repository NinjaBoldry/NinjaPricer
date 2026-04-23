import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCardAuth } from '@/lib/hubspot/card/auth';
import { runPublishScenario } from '@/lib/hubspot/quote/publishService';

const bodySchema = z.object({ scenarioId: z.string().min(1) });

export async function POST(req: Request): Promise<NextResponse> {
  if (!verifyCardAuth(req.headers)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const result = await runPublishScenario({
    scenarioId: parsed.data.scenarioId,
    correlationPrefix: 'card-publish',
  });

  return NextResponse.json(result);
}
