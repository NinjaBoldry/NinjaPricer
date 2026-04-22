import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as client from '../client';
import { submitApprovalRequest } from './request';

const fetchSpy = vi.spyOn(client, 'hubspotFetch');

const persistence = {
  upsertApprovalRequest: vi.fn(),
  updateQuotePublishState: vi.fn(),
  findOrCreateQuoteRow: vi.fn(),
};

describe('submitApprovalRequest', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
    Object.values(persistence).forEach((f) => f.mockReset());
  });

  it('PATCHes Deal pricer_approval_status=pending + pricer_margin_pct + pricer_scenario_id', async () => {
    fetchSpy.mockResolvedValue({});
    persistence.upsertApprovalRequest.mockResolvedValue({ id: 'req-1' });
    persistence.findOrCreateQuoteRow.mockResolvedValue({ id: 'q-row-1' });

    await submitApprovalRequest({
      scenarioId: 's1',
      hubspotDealId: 'd1',
      revision: 1,
      railViolations: [
        { productId: 'p1', kind: 'MIN_MARGIN_PCT', measuredValue: '0.15', threshold: '0.25' },
      ],
      marginPct: 0.22,
      persistence,
      correlationId: 'c1',
    } as any);

    expect(persistence.upsertApprovalRequest).toHaveBeenCalledWith({
      scenarioId: 's1',
      hubspotDealId: 'd1',
      railViolations: expect.any(Array),
    });
    expect(persistence.updateQuotePublishState).toHaveBeenCalledWith('q-row-1', 'PENDING_APPROVAL');

    const patchCall = fetchSpy.mock.calls.find(
      ([a]) => a.method === 'PATCH' && a.path.includes('/deals/d1'),
    );
    expect(patchCall).toBeTruthy();
    expect(patchCall![0].body).toEqual({
      properties: {
        pricer_approval_status: 'pending',
        pricer_margin_pct: '0.22',
        pricer_scenario_id: 's1',
      },
    });
  });
});
