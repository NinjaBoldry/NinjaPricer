import { vi } from 'vitest';
import type { SaaSRevenueModel } from '@prisma/client';
import type { ScenarioSaaSConfigRepository } from '../scenarioSaaSConfig';

/**
 * Test factory: returns a mock of ScenarioSaaSConfigRepository where every
 * method is a vi.fn() stub. By default findProductRevenueInfo resolves to a
 * SAAS_USAGE / PER_SEAT product so callers that don't care about the
 * revenueModel branch get a sensible default.
 *
 * Sibling pattern: lib/db/repositories/__mocks__/baseUsage.ts.
 */
export function mockScenarioSaaSConfigRepo(
  revenueModel: SaaSRevenueModel = 'PER_SEAT',
): ScenarioSaaSConfigRepository {
  return {
    findProductRevenueInfo: vi.fn().mockResolvedValue({ kind: 'SAAS_USAGE', revenueModel }),
    upsert: vi.fn().mockResolvedValue({
      id: 'sc1',
      scenarioId: 's1',
      productId: 'p1',
      seatCount: 0,
      personaMix: [],
      discountOverridePct: null,
      committedUnitsPerMonth: null,
      expectedActualUnitsPerMonth: null,
    }),
    listByScenarioId: vi.fn().mockResolvedValue([]),
    deleteById: vi.fn().mockResolvedValue(undefined),
  } as unknown as ScenarioSaaSConfigRepository;
}
