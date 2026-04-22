// hubspot-project/src/app/functions/get-card-state.ts
type Request = {
  context: { crm: { objectId: string; objectTypeId: string } };
  parameters?: Record<string, unknown>;
};

type Response = {
  statusCode: number;
  body: Record<string, unknown>;
};

export async function main(request: Request): Promise<Response> {
  const dealId = request.context?.crm?.objectId;
  if (!dealId) {
    return { statusCode: 400, body: { error: 'dealId missing from context' } };
  }

  const secret = process.env.NINJA_CARD_SECRET;
  const pricerUrl = process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app';
  if (!secret) {
    return { statusCode: 500, body: { error: 'NINJA_CARD_SECRET not configured' } };
  }

  const res = await fetch(`${pricerUrl}/api/hubspot/card/state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ninja-Card-Secret': secret,
    },
    body: JSON.stringify({ dealId }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { statusCode: res.status, body };
}
