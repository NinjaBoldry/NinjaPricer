import { NextResponse } from 'next/server';
import { createReadStream, statSync } from 'node:fs';
import { getSessionUser } from '@/lib/auth/session';
import { authenticateMcpRequest } from '@/lib/mcp/auth';
import { QuoteRepository } from '@/lib/db/repositories/quote';
import { prisma } from '@/lib/db/client';

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

async function resolveUser(request: Request) {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (header?.startsWith('Bearer ')) {
    try {
      const ctx = await authenticateMcpRequest(request);
      return ctx.user;
    } catch {
      return null;
    }
  }
  return getSessionUser();
}

export async function GET(
  request: Request,
  context: { params: { quoteId: string } },
) {
  const user = await resolveUser(request);
  if (!user) return notFound();

  const repo = new QuoteRepository(prisma);
  const quote = await repo.findById(context.params.quoteId);
  if (!quote) return notFound();

  const { searchParams } = new URL(request.url);
  const variant = searchParams.get('variant') === 'internal' ? 'internal' : 'customer';

  const isOwner = quote.scenario.ownerId === user.id;
  const isAdmin = user.role === 'ADMIN';
  if (!(isOwner || isAdmin)) return notFound();
  if (variant === 'internal' && !isAdmin) return notFound();

  const filePath = variant === 'internal' ? quote.internalPdfUrl : quote.pdfUrl;
  if (!filePath) return notFound();

  try {
    const stat = statSync(filePath);
    const stream = createReadStream(filePath);
    // Node ReadStream works as a Web-streams-compatible source via Response streaming.
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(stat.size),
        'Content-Disposition': `attachment; filename="quote-${quote.id}-${variant}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return notFound();
  }
}
