// hubspot-project/src/app/functions/link-deal.ts
type Request = {
  context: { crm: { objectId: string } };
  parameters?: { customerName?: string; contactId?: string; companyId?: string };
};

type Response = { statusCode: number; body: Record<string, unknown> };

export async function main(request: Request): Promise<Response> {
  const dealId = request.context?.crm?.objectId;
  const params = request.parameters ?? {};
  if (!dealId || !params.customerName) {
    return { statusCode: 400, body: { error: 'dealId and customerName required' } };
  }

  const accessToken = process.env.PRIVATE_APP_ACCESS_TOKEN;
  const pricerUrl = process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app';
  if (!accessToken) {
    return {
      statusCode: 500,
      body: { error: 'PRIVATE_APP_ACCESS_TOKEN missing from runtime env' },
    };
  }

  const res = await fetch(`${pricerUrl}/api/hubspot/card/link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      dealId,
      customerName: params.customerName,
      contactId: params.contactId,
      companyId: params.companyId,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { statusCode: res.status, body };
}
