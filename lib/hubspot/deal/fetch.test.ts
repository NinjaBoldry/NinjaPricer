import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as client from '../client';
import { fetchDealSnapshot } from './fetch';

describe('fetchDealSnapshot', () => {
  const fetchSpy = vi.spyOn(client, 'hubspotFetch');

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('(a) happy path: resolves deal name, pipeline stage label, and company name', async () => {
    // 1. GET deal
    fetchSpy.mockResolvedValueOnce({
      id: 'deal-1',
      properties: {
        dealname: 'Acme Corp Deal',
        dealstage: 'appointmentscheduled',
        pipeline: 'pipe-1',
      },
      associations: {
        companies: { results: [{ id: 'co-1' }] },
        contacts: { results: [{ id: 'ct-1' }] },
      },
    });
    // 2. GET pipelines
    fetchSpy.mockResolvedValueOnce({
      results: [
        {
          id: 'pipe-1',
          stages: [
            { id: 'appointmentscheduled', label: 'Discovery' },
            { id: 'qualifiedtobuy', label: 'Qualified' },
          ],
        },
      ],
    });
    // 3. GET company
    fetchSpy.mockResolvedValueOnce({
      properties: { name: 'Acme Corp' },
    });

    const result = await fetchDealSnapshot('deal-1', 'corr-1');

    expect(result).toEqual({
      dealName: 'Acme Corp Deal',
      dealStage: 'Discovery',
      dealStageId: 'appointmentscheduled',
      companyId: 'co-1',
      companyName: 'Acme Corp',
      primaryContactId: 'ct-1',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('(b) deal has no company association: companyId and companyName are null', async () => {
    // 1. GET deal — no associations at all
    fetchSpy.mockResolvedValueOnce({
      id: 'deal-2',
      properties: { dealname: 'Orphan Deal', dealstage: 'qualifiedtobuy', pipeline: 'pipe-1' },
      associations: {},
    });
    // 2. GET pipelines
    fetchSpy.mockResolvedValueOnce({
      results: [
        {
          id: 'pipe-1',
          stages: [{ id: 'qualifiedtobuy', label: 'Qualified' }],
        },
      ],
    });
    // company fetch should NOT be called

    const result = await fetchDealSnapshot('deal-2', 'corr-2');

    expect(result.companyId).toBeNull();
    expect(result.companyName).toBeNull();
    expect(result.dealStage).toBe('Qualified');
    // Only deal + pipelines calls; no company call
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('(c) pipelines API failure falls back to raw stage id', async () => {
    // 1. GET deal
    fetchSpy.mockResolvedValueOnce({
      id: 'deal-3',
      properties: { dealname: 'Stage-Unknown Deal', dealstage: 'contractsent', pipeline: 'pipe-x' },
      associations: {
        companies: { results: [{ id: 'co-3' }] },
        contacts: { results: [] },
      },
    });
    // 2. GET pipelines → throws
    fetchSpy.mockRejectedValueOnce(new Error('pipelines API down'));
    // 3. GET company
    fetchSpy.mockResolvedValueOnce({
      properties: { name: 'Beta Inc' },
    });

    const result = await fetchDealSnapshot('deal-3', 'corr-3');

    // Stage label falls back to the raw id
    expect(result.dealStage).toBe('contractsent');
    expect(result.dealStageId).toBe('contractsent');
    expect(result.companyName).toBe('Beta Inc');
    expect(result.primaryContactId).toBeNull();
  });
});
