import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCardSecret } from '@/lib/hubspot/card/auth';
import { prisma } from '@/lib/db/client';

const bodySchema = z.object({
  dealId: z.string().min(1),
  customerName: z.string().trim().min(1),
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
      pricerUrl: `${process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app'}/scenarios/${existing.id}/hubspot`,
      reused: true,
    });
  }

  // Create a new scenario. Owner is resolved via a dedicated "HubSpot card" service user that must exist in the DB.
  // This keeps the scenario audit trail attributed to the card's origin rather than a random admin user.
  const ownerEmail = process.env.HUBSPOT_CARD_SERVICE_USER_EMAIL ?? 'hubspot-card@ninjaconcepts.com';
  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    create: { email: ownerEmail, role: 'ADMIN' },
    update: {},
  });

  const scenario = await prisma.scenario.create({
    data: {
      name: `Quote for ${parsed.data.customerName}`,
      customerName: parsed.data.customerName,
      ownerId: owner.id,
      contractMonths: 12,
      hubspotDealId: parsed.data.dealId,
      hubspotCompanyId: parsed.data.companyId ?? null,
      hubspotPrimaryContactId: parsed.data.contactId ?? null,
    },
  });

  return NextResponse.json({
    scenarioId: scenario.id,
    pricerUrl: `${process.env.PRICER_APP_URL ?? 'https://ninjapricer-production.up.railway.app'}/scenarios/${scenario.id}/hubspot`,
    reused: false,
  });
}
