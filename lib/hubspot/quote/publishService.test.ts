/**
 * Unit tests for runPublishScenario — Phase 2c approval-flow branching.
 *
 * Three branches under test:
 *   1. Hard-rail override + no approval request → submitApprovalRequest → { status: 'pending_approval' }
 *   2. Hard-rail override + APPROVED status     → proceed to publish    → { status: 'published' }
 *   3. Hard-rail override + REJECTED status     → return immediately    → { status: 'rejected' }
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HubSpotApprovalStatus, HubSpotPublishState } from '@prisma/client';

// ---------------------------------------------------------------------------
// Shared mock state — mutated per-test via beforeEach
// ---------------------------------------------------------------------------

const mockApprovalRepo = {
  findByScenarioId: vi.fn(),
  upsert: vi.fn(),
};

const mockQuoteRepo = {
  findByScenarioAndRevision: vi.fn(),
  create: vi.fn(),
  updatePublishState: vi.fn(),
  findLatestPublishedPrior: vi.fn(),
  markSuperseded: vi.fn(),
};

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/client', () => ({
  prisma: {
    hubSpotQuote: {
      findFirst: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/services/rateSnapshot', () => ({
  computeScenario: vi.fn(),
}));

vi.mock('@/lib/hubspot/quote/publish', () => ({
  publishScenarioToHubSpot: vi.fn(),
  MissingDealLinkError: class MissingDealLinkError extends Error {
    constructor() {
      super('Missing deal link');
    }
  },
  UnresolvedHardRailOverrideError: class UnresolvedHardRailOverrideError extends Error {
    constructor() {
      super('Unresolved hard-rail override');
    }
  },
}));

vi.mock('@/lib/db/repositories/hubspotQuote', () => ({
  // Must use a regular function (not an arrow) so `new` works
  // eslint-disable-next-line object-shorthand
  HubSpotQuoteRepository: function HubSpotQuoteRepository() {
    return mockQuoteRepo;
  },
}));

vi.mock('@/lib/db/repositories/hubspotApprovalRequest', () => ({
  // Must use a regular function (not an arrow) so `new` works
  // eslint-disable-next-line object-shorthand
  HubSpotApprovalRequestRepository: function HubSpotApprovalRequestRepository() {
    return mockApprovalRepo;
  },
}));

vi.mock('@/lib/hubspot/approval/request', () => ({
  submitApprovalRequest: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — after vi.mock declarations
// ---------------------------------------------------------------------------

import * as rateSnapshotModule from '@/lib/services/rateSnapshot';
import * as publishModule from '@/lib/hubspot/quote/publish';
import * as submitApprovalModule from '@/lib/hubspot/approval/request';
import { prisma } from '@/lib/db/client';
import { runPublishScenario } from './publishService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCENARIO_ROW = {
  id: 'sc-1',
  name: 'Test Scenario',
  customerName: 'Acme Corp',
  hubspotDealId: 'deal-1',
  contractMonths: 12,
  saasConfigs: [],
  laborLines: [],
};

const makeComputeResult = (hardWarnings: boolean) => ({
  warnings: hardWarnings
    ? [
        {
          severity: 'hard',
          productId: 'p1',
          kind: 'MIN_MARGIN_PCT',
          measuredValue: '0.15',
          threshold: '0.25',
        },
      ]
    : [],
  perTab: [],
  totals: { marginPctNet: 0.32 },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runPublishScenario — Phase 2c approval-flow branching', () => {
  const mockComputeScenario = vi.mocked(rateSnapshotModule.computeScenario);
  const mockPublishToHubSpot = vi.mocked(publishModule.publishScenarioToHubSpot);
  const mockSubmitApprovalRequest = vi.mocked(submitApprovalModule.submitApprovalRequest);

  beforeEach(() => {
    vi.clearAllMocks();

    // prisma.hubSpotQuote.findFirst → no prior quote row (revision = 1)
    vi.mocked(prisma.hubSpotQuote.findFirst).mockResolvedValue(null);

    // Default: no hard warnings
    mockComputeScenario.mockResolvedValue({
      scenarioRow: SCENARIO_ROW as never,
      computeResult: makeComputeResult(false) as never,
    });

    // Default approval repo state
    mockApprovalRepo.findByScenarioId.mockResolvedValue(null);
    mockApprovalRepo.upsert.mockResolvedValue({ id: 'req-1' });

    // Default quote repo state
    mockQuoteRepo.findByScenarioAndRevision.mockResolvedValue(null);
    mockQuoteRepo.create.mockResolvedValue({ id: 'q-row-1', hubspotQuoteId: 'pending-sc-1-1' });
    mockQuoteRepo.updatePublishState.mockResolvedValue(undefined);
    mockQuoteRepo.findLatestPublishedPrior.mockResolvedValue(null);
    mockQuoteRepo.markSuperseded.mockResolvedValue(undefined);

    // Default publish outcome
    mockPublishToHubSpot.mockResolvedValue({
      hubspotQuoteId: 'hs-q-1',
      shareableUrl: 'https://app.hubspot.com/q/abc',
    });

    // Default submitApprovalRequest
    mockSubmitApprovalRequest.mockResolvedValue({ approvalRequestId: 'req-1' });
  });

  // -------------------------------------------------------------------------
  // Branch 1: pending_approval
  // -------------------------------------------------------------------------

  it('approval-pending branch: hard-rail override with no approval request → calls submitApprovalRequest and returns pending', async () => {
    mockComputeScenario.mockResolvedValue({
      scenarioRow: SCENARIO_ROW as never,
      computeResult: makeComputeResult(true) as never,
    });
    // approvalRepo.findByScenarioId already returns null (beforeEach)

    const result = await runPublishScenario({ scenarioId: 'sc-1' });

    expect(result).toMatchObject({
      status: 'pending_approval',
      approvalRequestId: 'req-1',
    });
    expect('correlationId' in result).toBe(true);

    expect(mockSubmitApprovalRequest).toHaveBeenCalledOnce();
    expect(mockSubmitApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarioId: 'sc-1',
        hubspotDealId: 'deal-1',
        railViolations: expect.arrayContaining([expect.objectContaining({ severity: 'hard' })]),
      }),
    );

    // HubSpot quote creation must NOT have been attempted
    expect(mockPublishToHubSpot).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Branch 2: approved → proceeds to publish
  // -------------------------------------------------------------------------

  it('approved branch: hard-rail override but HubSpotApprovalRequest.status = APPROVED → proceeds to publish', async () => {
    mockComputeScenario.mockResolvedValue({
      scenarioRow: SCENARIO_ROW as never,
      computeResult: makeComputeResult(true) as never,
    });
    mockApprovalRepo.findByScenarioId.mockResolvedValue({
      id: 'req-1',
      status: HubSpotApprovalStatus.APPROVED,
    });
    mockPublishToHubSpot.mockResolvedValue({
      hubspotQuoteId: 'hs-q-2',
      shareableUrl: null,
    });

    const result = await runPublishScenario({ scenarioId: 'sc-1' });

    expect(result).toMatchObject({
      status: 'published',
      hubspotQuoteId: 'hs-q-2',
    });

    // Must have passed hasUnresolvedHardRailOverrides: false (approval granted)
    expect(mockPublishToHubSpot).toHaveBeenCalledOnce();
    expect(mockPublishToHubSpot).toHaveBeenCalledWith(
      expect.objectContaining({
        scenario: expect.objectContaining({ hasUnresolvedHardRailOverrides: false }),
      }),
    );

    // submitApprovalRequest must NOT have been called
    expect(mockSubmitApprovalRequest).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Branch 3: rejected → returns immediately
  // -------------------------------------------------------------------------

  it('rejected branch: hard-rail override and status = REJECTED → returns { status: "rejected" } without republishing', async () => {
    mockComputeScenario.mockResolvedValue({
      scenarioRow: SCENARIO_ROW as never,
      computeResult: makeComputeResult(true) as never,
    });
    mockApprovalRepo.findByScenarioId.mockResolvedValue({
      id: 'req-99',
      status: HubSpotApprovalStatus.REJECTED,
    });

    const result = await runPublishScenario({ scenarioId: 'sc-1' });

    expect(result).toMatchObject({
      status: 'rejected',
      approvalRequestId: 'req-99',
    });
    expect('correlationId' in result).toBe(true);

    expect(mockSubmitApprovalRequest).not.toHaveBeenCalled();
    expect(mockPublishToHubSpot).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // No hard overrides → normal publish path (unchanged)
  // -------------------------------------------------------------------------

  it('no hard-rail overrides → proceeds directly to publish without consulting approval repo', async () => {
    // Default: no hard warnings (set in beforeEach)
    const result = await runPublishScenario({ scenarioId: 'sc-1' });

    expect(result).toMatchObject({
      status: 'published',
      hubspotQuoteId: 'hs-q-1',
    });
    expect(mockPublishToHubSpot).toHaveBeenCalledOnce();
    expect(mockSubmitApprovalRequest).not.toHaveBeenCalled();
  });
});
