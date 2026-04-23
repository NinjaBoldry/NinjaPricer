import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

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
    redirect(`/scenarios/${existing.id}/hubspot`);
  }

  const created = await prisma.scenario.create({
    data: {
      name: `Quote for HubSpot Deal ${dealId.slice(0, 8)}`,
      customerName: `HubSpot Deal ${dealId.slice(0, 8)}`,
      ownerId: user.id,
      contractMonths: 12,
      hubspotDealId: dealId,
    },
  });

  redirect(`/scenarios/${created.id}/hubspot`);
}
