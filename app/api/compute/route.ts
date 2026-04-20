import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { compute } from '@/lib/engine';
import { buildComputeRequest } from '@/lib/services/rateSnapshot';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let scenarioId: string;
  try {
    const body = (await request.json()) as { scenarioId?: unknown };
    if (typeof body.scenarioId !== 'string' || !body.scenarioId) {
      return NextResponse.json({ error: 'scenarioId is required' }, { status: 400 });
    }
    scenarioId = body.scenarioId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const { scenario, request: computeReq } = await buildComputeRequest(scenarioId);
    if (user.role === 'SALES' && scenario.ownerId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const result = compute(computeReq);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NotFoundError) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message, field: e.field }, { status: 422 });
    }
    throw e;
  }
}
