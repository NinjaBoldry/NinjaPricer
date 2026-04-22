// hubspot-project/src/app/functions/publish-quote.ts
type Request = {
  context: { crm: { objectId: string } };
  parameters?: { scenarioId?: string };
};

type Response = { statusCode: number; body: Record<string, unknown> };

export async function main(request: Request): Promise<Response> {
  const scenarioId = request.parameters?.scenarioId;
  if (!scenarioId) {
    return { statusCode: 400, body: { error: 'scenarioId required' } };
  }

  const secret = process.env.NINJA_CARD_SECRET;
  const pricerUrl = process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app';
  if (!secret) {
    return { statusCode: 500, body: { error: 'NINJA_CARD_SECRET not configured' } };
  }

  const res = await fetch(`${pricerUrl}/api/hubspot/card/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ninja-Card-Secret': secret,
    },
    body: JSON.stringify({ scenarioId }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { statusCode: res.status, body };
}
