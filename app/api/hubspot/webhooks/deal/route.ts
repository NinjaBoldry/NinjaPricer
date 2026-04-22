import { NextResponse } from 'next/server';
import { verifyHubSpotSignatureV3 } from '@/lib/hubspot/webhooks/verify';
import { HubSpotWebhookEventRepository } from '@/lib/db/repositories/hubspotWebhookEvent';
import { HubSpotQuoteRepository } from '@/lib/db/repositories/hubspotQuote';
import { processEvent } from '@/lib/hubspot/webhooks/process';
import { prisma } from '@/lib/db/client';

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.HUBSPOT_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json({ error: 'webhook secret not configured' }, { status: 500 });

  const signature = req.headers.get('x-hubspot-signature-v3') ?? '';
  const timestamp = req.headers.get('x-hubspot-request-timestamp') ?? '';
  const rawBody = await req.text();

  // The URL HubSpot signed must match this endpoint's public URL. The Railway URL
  // is authoritative (we may see req.url as a localhost/rewrite behind the load balancer).
  const publicUrl =
    process.env.HUBSPOT_WEBHOOK_URL_DEAL ??
    'https://ninjapricer-production.up.railway.app/api/hubspot/webhooks/deal';

  const ok = verifyHubSpotSignatureV3({
    method: 'POST',
    url: publicUrl,
    rawBody,
    timestamp,
    signature,
    secret,
  });
  if (!ok) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });

  let events: Array<Record<string, unknown>>;
  try {
    events = JSON.parse(rawBody);
    if (!Array.isArray(events)) events = [events as Record<string, unknown>];
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const ourAppId = process.env.HUBSPOT_APP_ID ? Number(process.env.HUBSPOT_APP_ID) : null;
  const eventRepo = new HubSpotWebhookEventRepository(prisma);
  const quoteRepo = new HubSpotQuoteRepository(prisma);

  for (const ev of events) {
    if (ourAppId && ev.sourceId === ourAppId) continue; // echo filter

    const row = await eventRepo.persist({
      hubspotEventId: String(ev.eventId),
      subscriptionType: String(ev.subscriptionType ?? 'deal.propertyChange'),
      objectType: 'deal',
      objectId: String(ev.objectId ?? ''),
      payload: ev as never,
    });

    setImmediate(() => {
      processEvent(row.id, { eventRepo, quoteRepo }).catch(() => {
        // processing errors are already recorded via markFailed inside processEvent
      });
    });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
