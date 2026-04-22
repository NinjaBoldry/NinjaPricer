import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCardSecret } from '@/lib/hubspot/card/auth';
import { buildScenarioHubspotUrl } from '@/lib/hubspot/card/urls';
import { prisma } from '@/lib/db/client';

const bodySchema = z.object({
  dealId: z.string().min(1),
  customerName: z.string().trim().optional(),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  if (!verifyCardSecret(req.headers)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  // Check for an existing scenario linked to this deal
  const existing = await prisma.scenario.findFirst({
    where: { hubspotDealId: parsed.data.dealId },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) {
    return NextResponse.json({
      scenarioId: existing.id,
      pricerUrl: buildScenarioHubspotUrl(existing.id),
      reused: true,
    });
  }

  // Create a new scenario. Owner is resolved via a dedicated "HubSpot card" service user that must
  // already exist in the DB. We intentionally never auto-create it to avoid privilege escalation.
  const ownerEmail = process.env.HUBSPOT_CARD_SERVICE_USER_EMAIL;
  if (!ownerEmail) {
    return NextResponse.json(
      {
        error: 'card_service_user_not_configured',
        message: 'HUBSPOT_CARD_SERVICE_USER_EMAIL not set.',
      },
      { status: 500 },
    );
  }

  const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner) {
    return NextResponse.json(
      {
        error: 'card_service_user_missing',
        message: `User ${ownerEmail} must exist in the pricer DB before the App Card can create scenarios. Add them via the admin UI first.`,
      },
      { status: 500 },
    );
  }

  const customerName = parsed.data.customerName ?? 'New Customer';

  const scenario = await prisma.scenario.create({
    data: {
      name: `Quote for ${customerName}`,
      customerName,
      ownerId: owner.id,
      contractMonths: 12,
      hubspotDealId: parsed.data.dealId,
      hubspotCompanyId: parsed.data.companyId ?? null,
      hubspotPrimaryContactId: parsed.data.contactId ?? null,
    },
  });

  return NextResponse.json({
    scenarioId: scenario.id,
    pricerUrl: buildScenarioHubspotUrl(scenario.id),
    reused: false,
  });
}
