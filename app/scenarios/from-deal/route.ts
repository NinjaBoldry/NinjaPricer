import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { fetchDealSnapshot } from '@/lib/hubspot/deal/fetch';
import { randomUUID } from 'node:crypto';

export async function GET(req: Request): Promise<NextResponse | never> {
  const user = await requireAuth();
  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get('dealId');
  if (!dealId) {
    return NextResponse.json({ error: 'dealId required' }, { status: 400 });
  }

  const existing = await prisma.scenario.findFirst({
    where: { hubspotDealId: dealId },
    orderBy: { updatedAt: 'desc' },
  });

  if (existing) {
    // Rep has likely customized the scenario — leave it as-is
    redirect(`/scenarios/${existing.id}/hubspot`);
  }

  const fallbackName = `HubSpot Deal ${dealId.slice(0, 8)}`;

  // Fetch Deal snapshot best-effort — don't block scenario creation if it fails
  let snapshotData: {
    name: string;
    customerName: string;
    hubspotDealName: string | null;
    hubspotDealStage: string | null;
    hubspotCompanyName: string | null;
    hubspotCompanyId: string | null;
    hubspotPrimaryContactId: string | null;
    hubspotSnapshotAt: Date | null;
  } = {
    name: fallbackName,
    customerName: fallbackName,
    hubspotDealName: null,
    hubspotDealStage: null,
    hubspotCompanyName: null,
    hubspotCompanyId: null,
    hubspotPrimaryContactId: null,
    hubspotSnapshotAt: null,
  };

  try {
    const snapshot = await fetchDealSnapshot(dealId, `from-deal-${randomUUID()}`);
    snapshotData = {
      name: snapshot.dealName ?? fallbackName,
      customerName: snapshot.companyName ?? snapshot.dealName ?? fallbackName,
      hubspotDealName: snapshot.dealName,
      hubspotDealStage: snapshot.dealStage,
      hubspotCompanyName: snapshot.companyName,
      hubspotCompanyId: snapshot.companyId,
      hubspotPrimaryContactId: snapshot.primaryContactId,
      hubspotSnapshotAt: new Date(),
    };
  } catch (err) {
    console.error('[from-deal] fetchDealSnapshot failed — creating scenario with placeholder', err);
  }

  const created = await prisma.scenario.create({
    data: {
      name: snapshotData.name,
      customerName: snapshotData.customerName,
      ownerId: user.id,
      contractMonths: 12,
      hubspotDealId: dealId,
      hubspotDealName: snapshotData.hubspotDealName,
      hubspotDealStage: snapshotData.hubspotDealStage,
      hubspotCompanyName: snapshotData.hubspotCompanyName,
      hubspotCompanyId: snapshotData.hubspotCompanyId,
      hubspotPrimaryContactId: snapshotData.hubspotPrimaryContactId,
      hubspotSnapshotAt: snapshotData.hubspotSnapshotAt,
    },
  });

  redirect(`/scenarios/${created.id}/hubspot`);
}
