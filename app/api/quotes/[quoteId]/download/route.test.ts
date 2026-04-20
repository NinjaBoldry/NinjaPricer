import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth/session', () => ({
  getSessionUser: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({ prisma: {} }));
vi.mock('@/lib/db/repositories/quote', () => ({
  // eslint-disable-next-line prefer-arrow-callback
  QuoteRepository: vi.fn().mockImplementation(function () { return { findById: vi.fn() }; }),
}));

import { getSessionUser } from '@/lib/auth/session';
import { QuoteRepository } from '@/lib/db/repositories/quote';
import { GET } from './route';

const mockGetSessionUser = vi.mocked(getSessionUser);
const MockQuoteRepository = vi.mocked(QuoteRepository);

function req(url: string) {
  return new Request(url);
}

describe('GET /api/quotes/[quoteId]/download', () => {
  it('returns 404 when session is missing (avoid existence leak)', async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await GET(req('http://x'), { params: { quoteId: 'q1' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 when quote not found', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'u1', role: 'SALES', email: 'u@x.com', name: 'U' });
    const findById = vi.fn(async () => null);
    // eslint-disable-next-line prefer-arrow-callback
    MockQuoteRepository.mockImplementation(function () { return { findById } as never; });
    const res = await GET(req('http://x'), { params: { quoteId: 'q1' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 when sales user does not own the scenario', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'u1', role: 'SALES', email: 'u@x.com', name: 'U' });
    const findById = vi.fn(async () => ({
      id: 'q1',
      scenario: { id: 's1', ownerId: 'someone-else' },
      pdfUrl: '/tmp/customer.pdf',
      internalPdfUrl: '/tmp/internal.pdf',
    }));
    // eslint-disable-next-line prefer-arrow-callback
    MockQuoteRepository.mockImplementation(function () { return { findById } as never; });
    const res = await GET(req('http://x'), { params: { quoteId: 'q1' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 when SALES requests variant=internal', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'u1', role: 'SALES', email: 'u@x.com', name: 'U' });
    const findById = vi.fn(async () => ({
      id: 'q1',
      scenario: { id: 's1', ownerId: 'u1' },
      pdfUrl: '/tmp/customer.pdf',
      internalPdfUrl: '/tmp/internal.pdf',
    }));
    // eslint-disable-next-line prefer-arrow-callback
    MockQuoteRepository.mockImplementation(function () { return { findById } as never; });
    const res = await GET(req('http://x?variant=internal'), { params: { quoteId: 'q1' } });
    expect(res.status).toBe(404);
  });
});
