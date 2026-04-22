import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEvent } from './process';

const mockQuoteRepo = {
  recordTerminalStatus: vi.fn(),
  recordDealOutcome: vi.fn(),
};
const mockEventRepo = {
  findById: vi.fn(),
  markProcessed: vi.fn(),
  markFailed: vi.fn(),
};

describe('processEvent', () => {
  beforeEach(() => {
    Object.values(mockQuoteRepo).forEach((f) => f.mockReset());
    Object.values(mockEventRepo).forEach((f) => f.mockReset());
  });

  it('skips already-processed events', async () => {
    mockEventRepo.findById.mockResolvedValue({ id: 'e1', processedAt: new Date() });
    await processEvent('e1', { quoteRepo: mockQuoteRepo, eventRepo: mockEventRepo } as any);
    expect(mockQuoteRepo.recordTerminalStatus).not.toHaveBeenCalled();
    expect(mockEventRepo.markProcessed).not.toHaveBeenCalled();
  });

  it('quote.propertyChange with terminal status updates quote + marks processed', async () => {
    mockEventRepo.findById.mockResolvedValue({
      id: 'e1',
      processedAt: null,
      subscriptionType: 'quote.propertyChange',
      objectType: 'quote',
      objectId: 'hs-q-1',
      payload: {
        propertyName: 'hs_status',
        propertyValue: 'ACCEPTED',
        occurredAt: '2026-04-23T00:00:00Z',
      },
    });
    await processEvent('e1', { quoteRepo: mockQuoteRepo, eventRepo: mockEventRepo } as any);
    expect(mockQuoteRepo.recordTerminalStatus).toHaveBeenCalledWith(
      'hs-q-1',
      'ACCEPTED',
      expect.any(Date),
    );
    expect(mockEventRepo.markProcessed).toHaveBeenCalledWith('e1');
  });

  it('non-terminal quote status change is a no-op for the quote repo but still marks processed', async () => {
    mockEventRepo.findById.mockResolvedValue({
      id: 'e1',
      processedAt: null,
      subscriptionType: 'quote.propertyChange',
      objectType: 'quote',
      objectId: 'hs-q-1',
      payload: { propertyName: 'hs_status', propertyValue: 'SENT' },
    });
    await processEvent('e1', { quoteRepo: mockQuoteRepo, eventRepo: mockEventRepo } as any);
    expect(mockQuoteRepo.recordTerminalStatus).not.toHaveBeenCalled();
    expect(mockEventRepo.markProcessed).toHaveBeenCalled();
  });

  it('deal.propertyChange dealstage Won → recordDealOutcome', async () => {
    mockEventRepo.findById.mockResolvedValue({
      id: 'e2',
      processedAt: null,
      subscriptionType: 'deal.propertyChange',
      objectType: 'deal',
      objectId: 'hs-d-1',
      payload: {
        propertyName: 'dealstage',
        propertyValue: 'closedwon',
        occurredAt: '2026-04-23T00:00:00Z',
        pricerScenarioId: 's1',
      },
    });
    await processEvent('e2', { quoteRepo: mockQuoteRepo, eventRepo: mockEventRepo } as any);
    expect(mockQuoteRepo.recordDealOutcome).toHaveBeenCalledWith('s1', 'WON', expect.any(Date));
  });

  it('markFailed on error, leaves processedAt null', async () => {
    mockEventRepo.findById.mockResolvedValue({
      id: 'e3',
      processedAt: null,
      subscriptionType: 'quote.propertyChange',
      objectType: 'quote',
      objectId: 'hs-q-1',
      payload: { propertyName: 'hs_status', propertyValue: 'ACCEPTED' },
    });
    mockQuoteRepo.recordTerminalStatus.mockRejectedValue(new Error('DB down'));
    await processEvent('e3', { quoteRepo: mockQuoteRepo, eventRepo: mockEventRepo } as any);
    expect(mockEventRepo.markFailed).toHaveBeenCalledWith('e3', 'DB down');
    expect(mockEventRepo.markProcessed).not.toHaveBeenCalled();
  });
});
