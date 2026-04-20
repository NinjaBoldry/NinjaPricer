import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { buildComputeRequest } from '@/lib/services/rateSnapshot';
import { generateQuote } from '@/lib/services/quote';
import { renderCustomerPdf } from '@/lib/pdf/customer';
import { renderInternalPdf } from '@/lib/pdf/internal';
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
    // Ownership check without re-running the engine a second time later.
    const { scenario } = await buildComputeRequest(scenarioId);
    if (user.role === 'SALES' && scenario.ownerId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const quote = await generateQuote(
      { scenarioId, generatedById: user.id },
      { renderPdf: { customer: renderCustomerPdf, internal: renderInternalPdf } },
    );

    return NextResponse.json({ id: quote.id, version: quote.version }, { status: 201 });
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
