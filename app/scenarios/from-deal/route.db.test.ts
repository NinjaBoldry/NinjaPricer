import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Mock next/navigation redirect — it throws a special error in Next.js
// which we capture as a redirect call.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT:${url}`), { digest: `NEXT_REDIRECT:${url}` });
  }),
}));

// Mock auth so the route thinks a rep is signed in
vi.mock('@/lib/auth/session', () => ({
  requireAuth: vi.fn(),
}));

import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { GET } from './route';

const prisma = new PrismaClient();

async function seedUser() {
  return prisma.user.upsert({
    where: { email: 'from-deal-test@test.local' },
    create: { email: 'from-deal-test@test.local', name: 'From Deal Test User', role: 'SALES' },
    update: {},
  });
}

function makeRequest(dealId?: string) {
  const url = dealId
    ? `http://localhost/scenarios/from-deal?dealId=${encodeURIComponent(dealId)}`
    : 'http://localhost/scenarios/from-deal';
  return new Request(url);
}

describe('GET /scenarios/from-deal', () => {
  beforeEach(async () => {
    await prisma.hubSpotQuote.deleteMany();
    await prisma.scenario.deleteMany();
    vi.clearAllMocks();
  });

  it('returns 400 when dealId is missing', async () => {
    const user = await seedUser();
    vi.mocked(requireAuth).mockResolvedValue({
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'SALES',
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('dealId required');
  });

  it('redirects to existing scenario when one is linked to the dealId', async () => {
    const user = await seedUser();
    vi.mocked(requireAuth).mockResolvedValue({
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'SALES',
    });

    const dealId = 'hs-deal-existing-001';
    const scenario = await prisma.scenario.create({
      data: {
        name: 'Existing scenario',
        customerName: 'Acme Corp',
        ownerId: user.id,
        contractMonths: 12,
        hubspotDealId: dealId,
      },
    });

    await expect(GET(makeRequest(dealId))).rejects.toMatchObject({
      digest: `NEXT_REDIRECT:/scenarios/${scenario.id}/hubspot`,
    });
    expect(vi.mocked(redirect)).toHaveBeenCalledWith(`/scenarios/${scenario.id}/hubspot`);
  });

  it('creates a new scenario and redirects when no scenario is linked', async () => {
    const user = await seedUser();
    vi.mocked(requireAuth).mockResolvedValue({
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'SALES',
    });

    const dealId = 'hs-deal-new-abc12345';

    let redirectUrl: string | undefined;
    vi.mocked(redirect).mockImplementation((url: string) => {
      redirectUrl = url;
      throw Object.assign(new Error(`NEXT_REDIRECT:${url}`), { digest: `NEXT_REDIRECT:${url}` });
    });

    await expect(GET(makeRequest(dealId))).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT:\/scenarios\/.+\/hubspot$/),
    });

    // Verify the scenario was actually created in the DB
    const created = await prisma.scenario.findFirst({
      where: { hubspotDealId: dealId },
    });
    expect(created).not.toBeNull();
    expect(created!.hubspotDealId).toBe(dealId);
    expect(created!.ownerId).toBe(user.id);
    expect(created!.contractMonths).toBe(12);
    expect(created!.customerName).toBe('HubSpot Deal hs-deal-');
    expect(redirectUrl).toBe(`/scenarios/${created!.id}/hubspot`);
  });
});
