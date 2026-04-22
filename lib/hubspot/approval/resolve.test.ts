import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveApprovalFromWebhook } from './resolve';

const approvalRepo = {
  findByHubspotDealId: vi.fn(),
  resolve: vi.fn(),
};
const quoteRepo = {
  findLatestByScenario: vi.fn(),
  updatePublishState: vi.fn(),
};
const runPublishScenario = vi.fn();

describe('resolveApprovalFromWebhook', () => {
  beforeEach(() => {
    approvalRepo.findByHubspotDealId.mockReset();
    approvalRepo.resolve.mockReset();
    quoteRepo.findLatestByScenario.mockReset();
    quoteRepo.updatePublishState.mockReset();
    runPublishScenario.mockReset();
  });

  it('approved → resolves request + calls runPublishScenario to resume publish', async () => {
    approvalRepo.findByHubspotDealId.mockResolvedValue({
      id: 'req-1',
      scenarioId: 's1',
      status: 'PENDING',
    });
    approvalRepo.resolve.mockResolvedValue({ id: 'req-1', status: 'APPROVED' });
    runPublishScenario.mockResolvedValue({ status: 'published', hubspotQuoteId: 'hs-q-1' });

    await resolveApprovalFromWebhook({
      hubspotDealId: 'd1',
      newStatus: 'approved',
      hubspotOwnerId: 'owner-42',
      deps: { approvalRepo, quoteRepo, runPublishScenario } as any,
    });

    expect(approvalRepo.resolve).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({ status: 'APPROVED' }),
    );
    expect(runPublishScenario).toHaveBeenCalledWith({
      scenarioId: 's1',
      correlationPrefix: 'approval-resume',
    });
  });

  it('rejected → resolves request + updates quote row to APPROVAL_REJECTED, does NOT call publish', async () => {
    approvalRepo.findByHubspotDealId.mockResolvedValue({
      id: 'req-1',
      scenarioId: 's1',
      status: 'PENDING',
    });
    quoteRepo.findLatestByScenario.mockResolvedValue({ id: 'q-row-1' });

    await resolveApprovalFromWebhook({
      hubspotDealId: 'd1',
      newStatus: 'rejected',
      hubspotOwnerId: 'owner-42',
      deps: { approvalRepo, quoteRepo, runPublishScenario } as any,
    });

    expect(approvalRepo.resolve).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({ status: 'REJECTED' }),
    );
    expect(quoteRepo.updatePublishState).toHaveBeenCalledWith('q-row-1', 'APPROVAL_REJECTED');
    expect(runPublishScenario).not.toHaveBeenCalled();
  });

  it('no approval request for deal → no-op (idempotent)', async () => {
    approvalRepo.findByHubspotDealId.mockResolvedValue(null);
    await resolveApprovalFromWebhook({
      hubspotDealId: 'd1',
      newStatus: 'approved',
      hubspotOwnerId: null,
      deps: { approvalRepo, quoteRepo, runPublishScenario } as any,
    });
    expect(approvalRepo.resolve).not.toHaveBeenCalled();
    expect(runPublishScenario).not.toHaveBeenCalled();
  });

  it('already-resolved request → no-op (idempotent on retries)', async () => {
    approvalRepo.findByHubspotDealId.mockResolvedValue({
      id: 'req-1',
      scenarioId: 's1',
      status: 'APPROVED',
      resolvedAt: new Date(),
    });
    await resolveApprovalFromWebhook({
      hubspotDealId: 'd1',
      newStatus: 'approved',
      hubspotOwnerId: null,
      deps: { approvalRepo, quoteRepo, runPublishScenario } as any,
    });
    expect(approvalRepo.resolve).not.toHaveBeenCalled();
    expect(runPublishScenario).not.toHaveBeenCalled();
  });
});
