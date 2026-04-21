import { describe, it, expect } from 'vitest';
import { ScenarioService } from './scenario';
import { mockScenarioRepo } from '../db/repositories/__mocks__/scenario';

describe('ScenarioService.create', () => {
  it('creates successfully with valid data', async () => {
    const repo = mockScenarioRepo();
    const service = new ScenarioService(repo);
    await expect(
      service.create({ name: 'Q1 Deal', customerName: 'Acme', ownerId: 'u1', contractMonths: 12 }),
    ).resolves.toBeDefined();
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('throws ValidationError when name is empty', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(
      service.create({ name: '', customerName: 'Acme', ownerId: 'u1', contractMonths: 12 }),
    ).rejects.toMatchObject({ field: 'name' });
  });

  it('throws ValidationError when customerName is empty', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(
      service.create({ name: 'Q1 Deal', customerName: '', ownerId: 'u1', contractMonths: 12 }),
    ).rejects.toMatchObject({ field: 'customerName' });
  });

  it('throws ValidationError when ownerId is empty', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(
      service.create({ name: 'Q1 Deal', customerName: 'Acme', ownerId: '', contractMonths: 12 }),
    ).rejects.toMatchObject({ field: 'ownerId' });
  });

  it('throws ValidationError when contractMonths < 1', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(
      service.create({ name: 'Q1 Deal', customerName: 'Acme', ownerId: 'u1', contractMonths: 0 }),
    ).rejects.toMatchObject({ field: 'contractMonths' });
  });

  it('throws ValidationError when contractMonths is not an integer', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(
      service.create({ name: 'Q1 Deal', customerName: 'Acme', ownerId: 'u1', contractMonths: 1.5 }),
    ).rejects.toMatchObject({ field: 'contractMonths' });
  });
});

describe('ScenarioService.update', () => {
  it('updates successfully with valid partial data', async () => {
    const repo = mockScenarioRepo();
    const service = new ScenarioService(repo);
    await expect(service.update('s1', { name: 'Renamed Deal' })).resolves.toBeDefined();
    expect(repo.update).toHaveBeenCalledOnce();
  });

  it('throws ValidationError when id is empty', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(service.update('', { name: 'Renamed Deal' })).rejects.toMatchObject({
      field: 'id',
    });
  });

  it('throws ValidationError when name is empty string if name is present in data', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(service.update('s1', { name: '' })).rejects.toMatchObject({ field: 'name' });
  });

  it('throws ValidationError when contractMonths < 1 if contractMonths present', async () => {
    const service = new ScenarioService(mockScenarioRepo());
    await expect(service.update('s1', { contractMonths: 0 })).rejects.toMatchObject({
      field: 'contractMonths',
    });
  });
});

describe('ScenarioService.listWithFilters', () => {
  it('delegates to repo with actingUser', async () => {
    const repo = mockScenarioRepo();
    const service = new ScenarioService(repo);
    const params = { actingUser: { id: 'u1', role: 'SALES' as const } };
    await expect(service.listWithFilters(params)).resolves.toEqual([]);
    expect(repo.listWithFilters).toHaveBeenCalledWith(params);
  });
});

describe('ScenarioService.archive', () => {
  it('delegates to repo', async () => {
    const repo = mockScenarioRepo();
    const service = new ScenarioService(repo);
    await expect(service.archive('s1')).resolves.toBeDefined();
    expect(repo.archive).toHaveBeenCalledWith('s1');
  });
});

import {
  upsertSaasConfig,
  setLaborLines,
  applyBundleToScenario,
  unapplyBundleFromScenario,
} from './scenario';

describe('upsertSaasConfig', () => {
  it('is exported as a function', () => {
    expect(typeof upsertSaasConfig).toBe('function');
  });
});

describe('setLaborLines', () => {
  it('is exported as a function', () => {
    expect(typeof setLaborLines).toBe('function');
  });
});

describe('applyBundleToScenario', () => {
  it('is exported as a function', () => {
    expect(typeof applyBundleToScenario).toBe('function');
  });

  it('runs all writes inside a single $transaction call', async () => {
    const { vi } = await import('vitest');

    // Minimal bundle with one SAAS_USAGE item
    const bundle = {
      id: 'b1',
      items: [
        {
          productId: 'p1',
          sortOrder: 0,
          product: { id: 'p1', name: 'Prod', kind: 'SAAS_USAGE' },
          sku: null,
          department: null,
          config: { kind: 'SAAS_USAGE', seatCount: 10, personaMix: [] },
        },
      ],
    };

    // Track calls inside the transaction
    const txScenarioUpdate = vi.fn().mockResolvedValue({});
    const txSaasUpsert = vi.fn().mockResolvedValue({});

    // tx object passed to $transaction callback
    const tx = {
      scenarioSaaSConfig: {
        upsert: txSaasUpsert,
      },
      scenario: { update: txScenarioUpdate },
    };

    const mockDb = {
      bundle: { findUnique: vi.fn().mockResolvedValue(bundle) },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) => {
        await cb(tx);
      }),
    } as unknown as typeof import('@/lib/db/client').prisma;

    await applyBundleToScenario({ scenarioId: 's1', bundleId: 'b1' }, mockDb);

    // $transaction must be called exactly once
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    // scenario.update (setting appliedBundleId) must be inside the tx, not on the outer db
    expect(txScenarioUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { appliedBundleId: 'b1' } }),
    );
  });
});

describe('unapplyBundleFromScenario', () => {
  it('is exported as a function', () => {
    expect(typeof unapplyBundleFromScenario).toBe('function');
  });
});
