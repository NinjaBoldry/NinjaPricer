import { vi } from 'vitest';
import type { IScenarioRepository } from '@/lib/services/scenario';

export function mockScenarioRepo(): IScenarioRepository {
  return {
    create: vi.fn().mockResolvedValue({ id: 's1', name: 'Test', customerName: 'Acme', ownerId: 'u1', contractMonths: 12, status: 'DRAFT', isArchived: false }),
    findById: vi.fn().mockResolvedValue(null),
    listWithFilters: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ id: 's1', name: 'Updated' }),
    archive: vi.fn().mockResolvedValue({ id: 's1', status: 'ARCHIVED', isArchived: true }),
  };
}
